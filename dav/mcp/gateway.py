"""MCP gateway: schema cache, validation, sync invoke."""

from __future__ import annotations

import asyncio
import sys
from typing import Any, Dict, Optional, Tuple

from dav.mcp.trust import MCPServerTrust, tool_name_allowed

# server_id -> tool_name -> input_schema dict
_tool_schema_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}


def clear_mcp_schema_cache(server_id: Optional[str] = None) -> None:
    if server_id is None:
        _tool_schema_cache.clear()
    else:
        _tool_schema_cache.pop(server_id, None)


def validate_required_args(schema: Dict[str, Any], arguments: Dict[str, Any]) -> Optional[str]:
    if schema.get("type") != "object":
        return None
    req = schema.get("required")
    if not isinstance(req, list):
        return None
    for key in req:
        if key not in arguments:
            return f"missing required argument: {key}"
    return None


def ensure_schemas_sync(trust: MCPServerTrust) -> Dict[str, Dict[str, Any]]:
    sid = trust.server_id
    if sid in _tool_schema_cache:
        return _tool_schema_cache[sid]
    try:
        from dav.mcp.client_stdio import list_tool_schemas, mcp_sdk_available

        if not mcp_sdk_available():
            _tool_schema_cache[sid] = {}
            return {}
        schemas = asyncio.run(list_tool_schemas(trust))
        _tool_schema_cache[sid] = schemas
        return schemas
    except RuntimeError:
        # nested event loop — skip cache fill
        return {}
    except Exception:
        _tool_schema_cache[sid] = {}
        return {}


def invoke_mcp_sync(
    trust: MCPServerTrust,
    tool_name: str,
    arguments: Dict[str, Any],
) -> Tuple[bool, str, str]:
    from dav.mcp.client_stdio import call_tool_async, mcp_sdk_available

    if not mcp_sdk_available():
        return (
            False,
            "",
            "MCP SDK not installed. Use Python 3.10+ and: pip install 'dav-ai[mcp]' (or pip install mcp).",
        )
    if sys.version_info < (3, 10):
        return False, "", "MCP client requires Python 3.10 or newer."
    try:
        return asyncio.run(call_tool_async(trust, tool_name, arguments))
    except Exception as e:
        return False, "", str(e)[:4000]
