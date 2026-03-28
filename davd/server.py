"""Asyncio Unix-socket JSON-RPC server for davd."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Dict

from dav.config import get_daemon_socket_path
from dav.sandbox.runner import run_sandboxed_command
from dav.sandbox.types import NetworkScope, SandboxProfile

logger = logging.getLogger("davd")


def _parse_profile(name: str) -> SandboxProfile:
    try:
        return SandboxProfile(name)
    except ValueError:
        return SandboxProfile.WORKSPACE_WRITE


def _parse_network(name: str) -> NetworkScope:
    try:
        return NetworkScope(name)
    except ValueError:
        return NetworkScope.OFF


async def _handle_line(line: str) -> Dict[str, Any]:
    req = json.loads(line)
    if req.get("jsonrpc") != "2.0":
        return {"jsonrpc": "2.0", "id": req.get("id"), "error": {"code": -32600, "message": "Invalid JSON-RPC"}}
    method = req.get("method")
    params = req.get("params") or {}
    req_id = req.get("id")

    try:
        if method == "health.ping":
            result: Any = {"ok": True}
        elif method == "exec.run":
            cmd = params.get("command") or ""
            cwd = params.get("cwd")
            profile = _parse_profile(params.get("profile") or "workspace_write")
            roots = params.get("workspace_roots") or []
            net = _parse_network(params.get("network") or "off")
            stream = bool(params.get("stream_output", False))
            # Run in thread pool — run_sandboxed_command is blocking
            loop = asyncio.get_event_loop()
            sr = await loop.run_in_executor(
                None,
                lambda: run_sandboxed_command(
                    cmd,
                    profile=profile,
                    cwd=cwd,
                    workspace_roots=roots,
                    network=net,
                    stream_output=stream,
                ),
            )
            result = {
                "ok": sr.ok,
                "stdout": sr.stdout,
                "stderr": sr.stderr,
                "return_code": sr.return_code,
                "duration_ms": sr.duration_ms,
                "used_sandbox": sr.used_sandbox,
                "detail": sr.detail,
            }
        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        return {"jsonrpc": "2.0", "id": req_id, "result": result}
    except Exception as e:
        logger.exception("RPC error")
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32000, "message": str(e)},
        }


async def _client_cb(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        raw = await reader.readline()
        if not raw:
            return
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            return
        resp = await _handle_line(line)
        writer.write(json.dumps(resp, ensure_ascii=False).encode("utf-8") + b"\n")
        await writer.drain()
    except Exception as e:
        logger.exception("client error: %s", e)
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def run_server() -> None:
    path = Path(get_daemon_socket_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass

    server = await asyncio.start_unix_server(_client_cb, path=str(path))
    try:
        path.chmod(0o600)
    except Exception:
        pass
    logger.info("davd listening on %s", path)
    async with server:
        await server.serve_forever()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_server())
