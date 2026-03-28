"""MCP trust registry: pinned servers, commands, allowed tools (Phase 4)."""

from __future__ import annotations

import fnmatch
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from dav.config import get_mcp_trust_config_path


@dataclass(frozen=True)
class MCPServerTrust:
    server_id: str
    command: str
    args: List[str]
    allowed_tools: Optional[List[str]]  # None = all; else glob patterns
    env_allowlist: Optional[List[str]]
    sha256_hint: Optional[str]  # supply-chain hint only (optional verify later)


def load_trust_registry(path: Optional[Path] = None) -> Dict[str, MCPServerTrust]:
    """Load ~/.dav/mcp_trust.json (or override). Unknown/malformed → empty registry."""
    p = path or get_mcp_trust_config_path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    servers = data.get("servers")
    if not isinstance(servers, list):
        return {}
    out: Dict[str, MCPServerTrust] = {}
    for raw in servers:
        if not isinstance(raw, dict):
            continue
        sid = str(raw.get("server_id") or "").strip()
        cmd = str(raw.get("command") or "").strip()
        if not sid or not cmd:
            continue
        args = raw.get("args") or []
        if not isinstance(args, list):
            args = []
        args = [str(a) for a in args]
        at = raw.get("allowed_tools")
        if at is not None and not isinstance(at, list):
            at = None
        else:
            at = [str(x) for x in at] if at else None
        env_al = raw.get("env_allowlist")
        if env_al is not None and not isinstance(env_al, list):
            env_al = None
        else:
            env_al = [str(x) for x in env_al] if env_al else None
        sh = raw.get("sha256")
        sh = str(sh).strip() if sh else None
        out[sid] = MCPServerTrust(
            server_id=sid,
            command=cmd,
            args=args,
            allowed_tools=at,
            env_allowlist=env_al,
            sha256_hint=sh,
        )
    return out


def tool_name_allowed(trust: MCPServerTrust, tool_name: str) -> bool:
    if not trust.allowed_tools:
        return True
    for pat in trust.allowed_tools:
        if fnmatch.fnmatchcase(tool_name, pat):
            return True
    return False


def get_server(server_id: str, registry: Optional[Dict[str, MCPServerTrust]] = None) -> Optional[MCPServerTrust]:
    reg = registry if registry is not None else load_trust_registry()
    return reg.get(server_id)
