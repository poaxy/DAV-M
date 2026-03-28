"""Dispatch tool calls through policy to executor."""

from __future__ import annotations

import getpass
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from dav.executor import execute_command
from dav.observability.audit import (
    append_audit_event,
    log_execution_attempt,
    log_mcp_call,
    log_policy_bundle_applied,
    log_policy_decision,
    log_sandbox_event,
)
from dav.observability.context import ensure_correlation_id, get_audit_runtime
from dav.observability.redaction import redact_secrets
from dav.policy import (
    EXEC_SHELL,
    MCP_CALL,
    READ_FS,
    ActionRequest,
    DecisionOutcome,
    ModeProfile,
    PolicyContext,
    evaluate,
)
from dav.terminal import confirm_action, render_command
from dav.tools.registry import get_tool
from dav.tools.types import ToolInvocationError, ToolResult

_bundle_apply_logged = False


def _sync_audit_runtime_from_bundle() -> None:
    from dav.policy.bundle import get_active_policy_bundle

    b = get_active_policy_bundle()
    rt = get_audit_runtime()
    if b.org_id:
        rt.org_id = b.org_id
    rt.policy_bundle_version = b.version
    rt.policy_bundle_hash = b.hash


def _maybe_log_policy_bundle_applied() -> None:
    global _bundle_apply_logged
    if _bundle_apply_logged:
        return
    from dav.policy.bundle import get_active_policy_bundle

    b = get_active_policy_bundle()
    if not b.hash and b.version == "0.0.0":
        return
    _bundle_apply_logged = True
    log_policy_bundle_applied(b.version or "0.0.0", "active_bundle", b.hash or "")


def _interactive_approve(
    *,
    action: str,
    resource_summary: Optional[str],
    confirm_message: str,
    preconfirmed: bool,
) -> bool:
    from dav.approval.routing import can_user_approve
    from dav.observability.audit import log_approval_requested, log_approval_resolved
    from dav.policy.bundle import get_active_policy_bundle, required_approval_role

    if preconfirmed:
        return True
    bundle = get_active_policy_bundle()
    role = required_approval_role(bundle, action)
    user = getpass.getuser()
    cid = ensure_correlation_id()
    log_approval_requested(action, resource_summary, role, cid)
    if not can_user_approve(role, user):
        log_approval_resolved(
            action,
            False,
            user,
            cid,
            reason_code="APPROVAL_ROLE_DENIED",
        )
        return False
    risk = None
    if action == EXEC_SHELL:
        risk = "Runs a shell command on this machine (sandbox/policy may apply)."
    elif action == MCP_CALL:
        risk = "Invokes a tool on a configured MCP server (trusted servers only)."
    ok = confirm_action(confirm_message, risk_hint=risk)
    log_approval_resolved(
        action,
        ok,
        user,
        cid,
        reason_code="USER_CONFIRM" if ok else "USER_REJECT",
    )
    return ok


def _dispatch_read_workspace_file(
    args: Dict[str, Any],
    *,
    read_only_mode: bool,
) -> ToolResult:
    """Read a text file under workspace roots (READ_FS policy)."""
    raw = (args.get("path") or "").strip()
    if not raw:
        err = ToolInvocationError("VALIDATION", "Missing required field: path")
        return err.to_tool_result()

    from dav.config import get_workspace_roots

    roots_raw = get_workspace_roots() or []
    roots_resolved: List[Path] = [Path(r).resolve() for r in roots_raw if r]
    if not roots_resolved:
        try:
            roots_resolved = [Path.cwd().resolve()]
        except Exception:
            roots_resolved = [Path.home().resolve()]

    p = Path(raw)
    candidates: List[Path] = []
    if p.is_absolute():
        candidates.append(p.resolve())
    else:
        for base in roots_resolved:
            candidates.append((base / p).resolve())

    chosen: Optional[Path] = None
    for cand in candidates:
        for base in roots_resolved:
            try:
                cand.relative_to(base)
                if cand.is_file():
                    chosen = cand
                    break
            except ValueError:
                continue
        if chosen:
            break

    if chosen is None:
        return ToolResult(
            ok=False,
            stdout="",
            stderr="File not found or path outside workspace roots",
            exit_code=-1,
            error_code="VALIDATION",
        )

    from dav.policy.bundle import get_active_policy_bundle

    b = get_active_policy_bundle()
    ctx = PolicyContext(
        mode=ModeProfile.READ_ONLY if read_only_mode else ModeProfile.WORKSPACE,
        execute_enabled=False,
        auto_confirm=True,
        workspace_roots=[str(r) for r in roots_resolved],
        policy_bundle_version=b.version,
        policy_bundle_hash=b.hash,
        org_id=b.org_id,
    )
    req = ActionRequest(action=READ_FS, resource=str(chosen)[:500])
    decision = evaluate(req, ctx)
    log_policy_decision(
        READ_FS,
        decision.outcome.value,
        decision.reason_code,
        decision.detail,
        policy_bundle_version=ctx.policy_bundle_version,
        policy_bundle_hash=ctx.policy_bundle_hash,
    )
    if decision.outcome == DecisionOutcome.DENY:
        return ToolResult(
            ok=False,
            stdout="",
            stderr=decision.detail or "Denied by policy",
            exit_code=-1,
            error_code="POLICY_DENY",
            message=decision.reason_code,
        )

    max_b = 256 * 1024
    try:
        data = chosen.read_bytes()
    except OSError as e:
        return ToolResult(
            ok=False,
            stdout="",
            stderr=str(e),
            exit_code=-1,
            error_code="EXEC_FAILED",
        )
    truncated = len(data) > max_b
    blob = data[:max_b]
    text = blob.decode("utf-8", errors="replace")
    if truncated:
        text += "\n[... truncated ...]\n"
    out = redact_secrets(text)
    log_execution_attempt(f"read:{chosen}", True, 0)
    return ToolResult(ok=True, stdout=out, stderr="", exit_code=0)


def _dispatch_mcp_invoke(
    args: Dict[str, Any],
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
    preconfirmed: bool,
) -> ToolResult:
    from dav.config import mcp_tools_enabled
    from dav.mcp.catalog import required_checksum_for_server, server_is_catalog_approved
    from dav.mcp.gateway import ensure_schemas_sync, invoke_mcp_sync, validate_required_args
    from dav.mcp.trust import get_server, load_trust_registry, tool_name_allowed

    if not mcp_tools_enabled():
        err = ToolInvocationError(
            "MCP_DISABLED",
            "MCP tools are disabled. Set DAV_MCP_ENABLED=1 and configure ~/.dav/mcp_trust.json.",
        )
        return err.to_tool_result()

    sid = str(args.get("server_id") or "").strip()
    tool_name = str(args.get("tool_name") or "").strip()
    raw_args = args.get("arguments")
    arguments: Dict[str, Any] = raw_args if isinstance(raw_args, dict) else {}

    if not sid or not tool_name:
        err = ToolInvocationError("VALIDATION", "server_id and tool_name are required")
        return err.to_tool_result()

    trust = get_server(sid, load_trust_registry())
    if trust is None:
        log_mcp_call(sid, tool_name, False, error_code="UNKNOWN_SERVER")
        return ToolResult(
            ok=False,
            stdout="",
            stderr=f"Unknown MCP server_id: {sid}. Add it to mcp_trust.json.",
            exit_code=-1,
            error_code="MCP_TRUST",
        )

    if not server_is_catalog_approved(sid):
        log_mcp_call(sid, tool_name, False, error_code="CATALOG_DENY")
        return ToolResult(
            ok=False,
            stdout="",
            stderr="Server not listed in approved_servers (DAV_MCP_CATALOG_ENFORCE=1).",
            exit_code=-1,
            error_code="MCP_CATALOG",
        )

    req_ck = required_checksum_for_server(sid)
    if req_ck:
        if not trust.sha256_hint or trust.sha256_hint.lower() != req_ck.lower():
            log_mcp_call(sid, tool_name, False, error_code="CHECKSUM_MISMATCH")
            return ToolResult(
                ok=False,
                stdout="",
                stderr="Trust sha256 does not match mcp_catalog required_checksums for this server.",
                exit_code=-1,
                error_code="MCP_CHECKSUM",
            )

    if not tool_name_allowed(trust, tool_name):
        log_mcp_call(sid, tool_name, False, error_code="TOOL_NOT_ALLOWED")
        return ToolResult(
            ok=False,
            stdout="",
            stderr=f"Tool not allowed by trust allowed_tools: {tool_name}",
            exit_code=-1,
            error_code="MCP_TOOL",
        )

    schemas = ensure_schemas_sync(trust)
    sch = schemas.get(tool_name)
    if sch:
        verr = validate_required_args(sch, arguments)
        if verr:
            return ToolResult(
                ok=False,
                stdout="",
                stderr=verr,
                exit_code=-1,
                error_code="VALIDATION",
            )

    ctx = _policy_context(
        execute_enabled=execute_enabled,
        auto_confirm=auto_confirm,
        read_only_mode=read_only_mode,
    )
    req = ActionRequest(
        action=MCP_CALL,
        resource=f"{sid}::{tool_name}"[:500],
        metadata={"server_id": sid, "tool_name": tool_name},
    )
    decision = evaluate(req, ctx)
    log_policy_decision(
        MCP_CALL,
        decision.outcome.value,
        decision.reason_code,
        decision.detail,
        policy_bundle_version=ctx.policy_bundle_version,
        policy_bundle_hash=ctx.policy_bundle_hash,
    )

    if decision.outcome == DecisionOutcome.DENY:
        log_mcp_call(sid, tool_name, False, error_code="POLICY_DENY")
        return ToolResult(
            ok=False,
            stdout="",
            stderr=decision.detail or "Denied by policy",
            exit_code=-1,
            error_code="POLICY_DENY",
            message=decision.reason_code,
        )

    if decision.outcome == DecisionOutcome.ASK:
        if not _interactive_approve(
            action=MCP_CALL,
            resource_summary=f"{sid}::{tool_name}",
            confirm_message=f"Allow MCP tool `{tool_name}` on server `{sid}`?",
            preconfirmed=preconfirmed,
        ):
            log_mcp_call(sid, tool_name, False, error_code="USER_REJECT")
            return ToolResult(
                ok=False,
                stdout="",
                stderr="User cancelled MCP confirmation or lacks approval role",
                exit_code=-1,
                error_code="USER_REJECT",
            )

    ok, out, err = invoke_mcp_sync(trust, tool_name, arguments)
    out = redact_secrets(out or "")
    err = redact_secrets(err or "")
    log_mcp_call(sid, tool_name, ok, error_code=None if ok else "MCP_ERROR")
    return ToolResult(
        ok=ok,
        stdout=out,
        stderr=err,
        exit_code=0 if ok else 1,
        error_code=None if ok else "MCP_FAILED",
    )


def _policy_context(
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
) -> PolicyContext:
    from dav.config import get_workspace_roots
    from dav.policy.bundle import get_active_policy_bundle

    mode = ModeProfile.READ_ONLY if read_only_mode else ModeProfile.WORKSPACE
    b = get_active_policy_bundle()
    return PolicyContext(
        mode=mode,
        execute_enabled=execute_enabled,
        auto_confirm=auto_confirm,
        workspace_roots=get_workspace_roots(),
        policy_bundle_version=b.version,
        policy_bundle_hash=b.hash,
        org_id=b.org_id,
    )


def dispatch_tool_call(
    name: str,
    arguments_json: str,
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool = False,
    preconfirmed: bool = False,
    automation_mode: bool = False,
    automation_logger: Any = None,
) -> ToolResult:
    """
    Run a registered tool by name with JSON arguments from the LLM.

    All shell execution goes through policy + audit + redaction on outputs.
    Phase 2: optional davd RPC, bubblewrap sandbox, network policy.
    """
    from dav.license_gate import check_license_for_tool
    from dav.usage_reporting import bump_tool_invocation

    lic_err = check_license_for_tool(name)
    if lic_err:
        err = ToolInvocationError("LICENSE", lic_err)
        return err.to_tool_result()

    _sync_audit_runtime_from_bundle()
    _maybe_log_policy_bundle_applied()
    bump_tool_invocation()

    if get_tool(name) is None:
        err = ToolInvocationError("UNKNOWN_TOOL", f"Unknown tool: {name}")
        return err.to_tool_result()

    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError as e:
        err = ToolInvocationError("VALIDATION", f"Invalid JSON arguments: {e}")
        return err.to_tool_result()

    if not isinstance(args, dict):
        err = ToolInvocationError("VALIDATION", "Tool arguments must be a JSON object")
        return err.to_tool_result()

    if name == "read_workspace_file":
        return _dispatch_read_workspace_file(args, read_only_mode=read_only_mode)

    if name == "mcp_invoke":
        return _dispatch_mcp_invoke(
            args,
            execute_enabled=execute_enabled,
            auto_confirm=auto_confirm,
            read_only_mode=read_only_mode,
            preconfirmed=preconfirmed,
        )

    if name != "exec_shell":
        err = ToolInvocationError("UNKNOWN_TOOL", f"Unknown tool: {name}")
        return err.to_tool_result()

    command = (args.get("command") or "").strip()
    if not command:
        err = ToolInvocationError("VALIDATION", "Missing required field: command")
        return err.to_tool_result()

    cwd = args.get("cwd")
    if cwd is not None and not isinstance(cwd, str):
        err = ToolInvocationError("VALIDATION", "cwd must be a string")
        return err.to_tool_result()

    use_sudo = bool(args.get("use_sudo"))
    if use_sudo and not command.strip().startswith("sudo "):
        command = f"sudo {command}"

    ctx = _policy_context(
        execute_enabled=execute_enabled,
        auto_confirm=auto_confirm,
        read_only_mode=read_only_mode,
    )
    req = ActionRequest(action=EXEC_SHELL, resource=command[:500], metadata={"cwd": cwd})
    decision = evaluate(req, ctx)

    log_policy_decision(
        EXEC_SHELL,
        decision.outcome.value,
        decision.reason_code,
        decision.detail,
        policy_bundle_version=ctx.policy_bundle_version,
        policy_bundle_hash=ctx.policy_bundle_hash,
    )

    if decision.outcome == DecisionOutcome.DENY:
        return ToolResult(
            ok=False,
            stdout="",
            stderr=decision.detail or "Denied by policy",
            exit_code=-1,
            error_code="POLICY_DENY",
            message=decision.reason_code,
        )

    confirm = False
    if decision.outcome == DecisionOutcome.ASK:
        if not preconfirmed:
            render_command(command)
            if not _interactive_approve(
                action=EXEC_SHELL,
                resource_summary=command[:500],
                confirm_message="Execute this command?",
                preconfirmed=False,
            ):
                log_execution_attempt(command, False, -1, policy_reason="USER_REJECT")
                return ToolResult(
                    ok=False,
                    stdout="",
                    stderr="User cancelled confirmation or lacks approval role",
                    exit_code=-1,
                    error_code="USER_REJECT",
                )
        confirm = False
    elif decision.outcome == DecisionOutcome.ALLOW:
        confirm = False

    import platform

    from dav.config import get_sandbox_mode, sandbox_strict_mode, use_daemon
    from dav.network_policy import load_network_policy, egress_to_scope
    from dav.sandbox.linux_bwrap import bwrap_available
    from dav.sandbox.policy_map import sandbox_profile_for_mode
    from dav.sandbox.runner import run_sandboxed_command, should_use_sandbox
    from dav.sandbox.types import NetworkScope, SandboxProfile

    policy_mode = ctx.mode
    sprof = ctx.sandbox_profile or sandbox_profile_for_mode(policy_mode)
    net = ctx.network_scope or egress_to_scope(load_network_policy().get("egress", "off"))
    roots = list(ctx.workspace_roots) or []

    if re.search(r"\bsudo\b", command):
        sprof = SandboxProfile.FULL_ACCESS
        append_audit_event("sandbox.bypass", {"reason": "sudo", "command": command[:200]})

    smode = get_sandbox_mode()
    if (
        smode == "on"
        and sandbox_strict_mode()
        and sprof != SandboxProfile.FULL_ACCESS
        and platform.system() == "Linux"
        and not bwrap_available()
    ):
        return ToolResult(
            ok=False,
            stdout="",
            stderr="Sandbox required (DAV_SANDBOX=on) but bubblewrap (bwrap) was not found.",
            exit_code=-1,
            error_code="SANDBOX_UNAVAILABLE",
        )

    # Optional daemon (same sandbox runner on server)
    if use_daemon() and not automation_mode:
        try:
            from dav.daemon.client import exec_via_daemon, health_ping

            if health_ping():
                sr = exec_via_daemon(
                    command,
                    cwd if cwd else None,
                    sprof,
                    roots,
                    net,
                    stream_output=False,
                )
                stdout = redact_secrets(sr.stdout or "")
                stderr = redact_secrets(sr.stderr or "")
                log_sandbox_event(
                    sprof.value,
                    net.value,
                    sr.used_sandbox,
                    "daemon",
                )
                log_execution_attempt(command, sr.ok, sr.return_code)
                return ToolResult(
                    ok=sr.ok,
                    stdout=stdout,
                    stderr=stderr,
                    exit_code=sr.return_code,
                    error_code=None if sr.ok else "EXEC_FAILED",
                )
        except Exception:
            pass

    stream_out = not automation_mode
    if should_use_sandbox(sprof, smode) and sprof != SandboxProfile.FULL_ACCESS:
        sr = run_sandboxed_command(
            command,
            profile=sprof,
            cwd=cwd if cwd else None,
            workspace_roots=roots,
            network=net,
            stream_output=stream_out,
        )
        log_sandbox_event(sprof.value, net.value, sr.used_sandbox, sr.detail)
        stdout = redact_secrets(sr.stdout or "")
        stderr = redact_secrets(sr.stderr or "")
        log_execution_attempt(command, sr.ok, sr.return_code)
        return ToolResult(
            ok=sr.ok,
            stdout=stdout,
            stderr=stderr,
            return_code=sr.return_code,
            error_code=None if sr.ok else "EXEC_FAILED",
        )

    success, stdout, stderr, return_code = execute_command(
        command,
        confirm=confirm,
        cwd=cwd if cwd else None,
        stream_output=stream_out,
        automation_mode=automation_mode,
        automation_logger=automation_logger,
    )
    stdout = redact_secrets(stdout or "")
    stderr = redact_secrets(stderr or "")
    log_sandbox_event(sprof.value, net.value, False, "passthrough_executor")
    log_execution_attempt(command, success, return_code)

    return ToolResult(
        ok=success,
        stdout=stdout,
        stderr=stderr,
        exit_code=return_code,
        error_code=None if success else "EXEC_FAILED",
    )
