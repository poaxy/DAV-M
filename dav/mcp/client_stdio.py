"""MCP stdio client (requires optional `mcp` package, Python 3.10+)."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple

from dav.mcp.trust import MCPServerTrust


def _filtered_env(trust: MCPServerTrust) -> Dict[str, str]:
    if not trust.env_allowlist:
        return {k: str(v) for k, v in os.environ.items()}
    allow = set(trust.env_allowlist)
    return {k: str(v) for k, v in os.environ.items() if k in allow}


def _result_to_text(result: Any) -> Tuple[str, str, bool]:
    """Return (stdout, stderr, is_error)."""
    lines: List[str] = []
    err_lines: List[str] = []
    is_err = bool(getattr(result, "isError", False))
    for block in getattr(result, "content", None) or []:
        t = getattr(block, "type", None)
        text = getattr(block, "text", None) or ""
        if t == "text" or text:
            lines.append(text)
        else:
            lines.append(str(block))
    out = "\n".join(lines)
    if is_err and not out:
        out = "MCP tool returned isError=true"
    return out, "\n".join(err_lines), is_err


async def list_tool_schemas(trust: MCPServerTrust) -> Dict[str, Dict[str, Any]]:
    """Return tool_name -> inputSchema dict (JSON Schema object or empty)."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=trust.command,
        args=list(trust.args),
        env=_filtered_env(trust),
    )
    out: Dict[str, Dict[str, Any]] = {}
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            lr = await session.list_tools()
            for t in getattr(lr, "tools", None) or []:
                name = getattr(t, "name", None) or ""
                sch = getattr(t, "inputSchema", None)
                if name:
                    if sch is None:
                        out[name] = {"type": "object", "properties": {}}
                    elif isinstance(sch, dict):
                        out[name] = sch
                    else:
                        try:
                            out[name] = sch.model_dump(exclude_none=True)  # type: ignore[attr-defined]
                        except Exception:
                            out[name] = {"type": "object", "properties": {}}
    return out


async def call_tool_async(
    trust: MCPServerTrust,
    tool_name: str,
    arguments: Dict[str, Any],
) -> Tuple[bool, str, str]:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=trust.command,
        args=list(trust.args),
        env=_filtered_env(trust),
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments or None)
            out, err, is_err = _result_to_text(result)
            return (not is_err, out, err)


def mcp_sdk_available() -> bool:
    try:
        import mcp  # noqa: F401
        from mcp.client.stdio import stdio_client  # noqa: F401

        return True
    except ImportError:
        return False
