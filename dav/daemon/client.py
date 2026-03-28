"""Synchronous JSON-RPC client over Unix socket (davd)."""

from __future__ import annotations

import json
import socket
from typing import Any, Dict, List, Optional, Tuple

from dav.config import get_daemon_socket_path
from dav.sandbox.types import NetworkScope, SandboxProfile, SandboxResult


def _request(method: str, params: Dict[str, Any], timeout: float = 300.0) -> Any:
    path = str(get_daemon_socket_path())
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    data = json.dumps(payload).encode("utf-8") + b"\n"
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        s.connect(path)
        s.sendall(data)
        buf = bytearray()
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf.extend(chunk)
            if b"\n" in buf:
                break
        line = bytes(buf).split(b"\n", 1)[0].decode("utf-8", errors="replace")
        resp = json.loads(line)
        if "error" in resp:
            raise RuntimeError(resp["error"].get("message", str(resp["error"])))
        return resp.get("result")


def health_ping() -> bool:
    try:
        r = _request("health.ping", {}, timeout=5.0)
        return bool(r and r.get("ok"))
    except Exception:
        return False


def exec_via_daemon(
    command: str,
    cwd: Optional[str],
    profile: SandboxProfile,
    workspace_roots: List[str],
    network: NetworkScope,
    stream_output: bool = False,
) -> SandboxResult:
    """Run exec.run on davd; returns SandboxResult."""
    r = _request(
        "exec.run",
        {
            "command": command,
            "cwd": cwd,
            "profile": profile.value,
            "workspace_roots": workspace_roots,
            "network": network.value,
            "stream_output": stream_output,
        },
        timeout=300.0,
    )
    return SandboxResult(
        ok=bool(r.get("ok")),
        stdout=r.get("stdout") or "",
        stderr=r.get("stderr") or "",
        return_code=int(r.get("return_code", 1)),
        duration_ms=float(r.get("duration_ms", 0)),
        used_sandbox=bool(r.get("used_sandbox", False)),
        detail=r.get("detail"),
    )
