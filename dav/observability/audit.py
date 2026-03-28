"""Append-only JSONL audit log for policy and execution events."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from dav.observability.context import AUDIT_SCHEMA_VERSION, get_audit_runtime


def _audit_path() -> Path:
    base = os.getenv("DAV_AUDIT_LOG_DIR")
    if base:
        return Path(base).expanduser() / "dav_audit.jsonl"
    return Path.home() / ".dav" / "logs" / "dav_audit.jsonl"


def _base_record(event_type: str) -> Dict[str, Any]:
    rt = get_audit_runtime()
    rec: Dict[str, Any] = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "event_id": str(uuid.uuid4()),
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": event_type,
    }
    if rt.session_id:
        rec["session_id"] = rt.session_id
    if rt.correlation_id:
        rec["correlation_id"] = rt.correlation_id
    if rt.org_id:
        rec["org_id"] = rt.org_id
    if rt.tenant_id:
        rec["tenant_id"] = rt.tenant_id
    if rt.actor:
        rec["actor"] = rt.actor
    if rt.policy_bundle_version:
        rec["policy_bundle_version"] = rt.policy_bundle_version
    if rt.policy_bundle_hash:
        rec["policy_bundle_hash"] = rt.policy_bundle_hash
    if rt.data_classification:
        rec["data_classification"] = rt.data_classification
    if rt.extra:
        rec.update(rt.extra)
    return rec


def append_audit_event(event_type: str, payload: Dict[str, Any]) -> None:
    """Append one JSON object per line. Failures are silent (logging must not break CLI)."""
    path = _audit_path()
    try:
        maybe_rotate_audit_log(path)
        record = _base_record(event_type)
        record.update(payload)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


def maybe_rotate_audit_log(path: Path) -> None:
    """Rotate when size exceeds DAV_AUDIT_MAX_BYTES (default 50MB)."""
    try:
        max_b = int(os.getenv("DAV_AUDIT_MAX_BYTES", str(50 * 1024 * 1024)))
    except ValueError:
        max_b = 50 * 1024 * 1024
    try:
        if not path.is_file():
            path.parent.mkdir(parents=True, exist_ok=True)
            return
        if path.stat().st_size <= max_b:
            return
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        rotated = path.with_name(f"{path.name}.{ts}")
        n = 0
        while rotated.exists():
            n += 1
            rotated = path.with_name(f"{path.name}.{ts}.{n}")
        path.rename(rotated)
    except Exception:
        pass


def log_policy_decision(
    action: str,
    outcome: str,
    reason_code: str,
    detail: Optional[str] = None,
    *,
    policy_bundle_version: Optional[str] = None,
    policy_bundle_hash: Optional[str] = None,
) -> None:
    payload: Dict[str, Any] = {
        "action": action,
        "outcome": outcome,
        "reason_code": reason_code,
        "detail": detail,
    }
    if policy_bundle_version:
        payload["policy_bundle_version"] = policy_bundle_version
    if policy_bundle_hash:
        payload["policy_bundle_hash"] = policy_bundle_hash
    append_audit_event("policy.decision", payload)


def log_execution_attempt(
    command: str,
    success: bool,
    return_code: int,
    policy_reason: Optional[str] = None,
) -> None:
    append_audit_event(
        "exec.attempt",
        {
            "command": command[:2000],
            "success": success,
            "return_code": return_code,
            "policy_reason": policy_reason,
        },
    )


def log_sandbox_event(
    profile: str,
    network: str,
    used_sandbox: bool,
    detail: Optional[str] = None,
) -> None:
    append_audit_event(
        "sandbox.exec",
        {
            "profile": profile,
            "network": network,
            "used_sandbox": used_sandbox,
            "detail": detail,
        },
    )


def log_mcp_call(
    server_id: str,
    tool_name: str,
    ok: bool,
    *,
    error_code: Optional[str] = None,
    gen_ai_tool_name: str = "mcp_invoke",
) -> None:
    """Audit MCP invocation without raw arguments (privacy / supply chain)."""
    append_audit_event(
        "mcp.tool.invoke",
        {
            "server_id": server_id[:200],
            "tool_name": tool_name[:200],
            "ok": ok,
            "error_code": error_code,
            "gen_ai.tool.name": gen_ai_tool_name,
        },
    )


def log_approval_requested(
    action: str,
    resource_summary: Optional[str],
    required_role: Optional[str],
    correlation_id: str,
) -> None:
    append_audit_event(
        "approval.requested",
        {
            "action": action,
            "resource_summary": (resource_summary or "")[:500],
            "required_role": required_role,
            "correlation_id": correlation_id,
        },
    )


def log_approval_resolved(
    action: str,
    approved: bool,
    approver_id: str,
    correlation_id: str,
    reason_code: Optional[str] = None,
) -> None:
    append_audit_event(
        "approval.resolved",
        {
            "action": action,
            "approved": approved,
            "approver_id": approver_id[:200],
            "correlation_id": correlation_id,
            "reason_code": reason_code,
        },
    )


def log_policy_bundle_applied(
    version: str,
    source: str,
    bundle_hash: str,
) -> None:
    append_audit_event(
        "policy.bundle.applied",
        {
            "version": version,
            "source": source,
            "bundle_hash": bundle_hash[:128],
        },
    )


def log_license_state_change(
    previous: str,
    current: str,
    detail: Optional[str] = None,
) -> None:
    append_audit_event(
        "license.state_change",
        {
            "previous": previous,
            "current": current,
            "detail": detail,
        },
    )


def append_product_analytics_event(event_type: str, payload: Dict[str, Any]) -> None:
    """Opt-in only: DAV_PRODUCT_ANALYTICS=1, separate file from audit."""
    if os.getenv("DAV_PRODUCT_ANALYTICS", "").strip().lower() not in (
        "1",
        "true",
        "yes",
    ):
        return
    base = os.getenv("DAV_ANALYTICS_LOG_DIR") or str(Path.home() / ".dav" / "logs")
    path = Path(base).expanduser() / "dav_product_analytics.jsonl"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "type": event_type,
            **payload,
        }
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass
