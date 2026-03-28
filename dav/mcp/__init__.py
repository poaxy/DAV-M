"""MCP gateway: trust registry, governed tool invocation (Phase 4)."""

from dav.mcp.catalog import (
    approved_server_ids,
    load_mcp_catalog,
    server_is_catalog_approved,
)
from dav.mcp.trust import MCPServerTrust, get_server, load_trust_registry, tool_name_allowed

__all__ = [
    "MCPServerTrust",
    "approved_server_ids",
    "get_server",
    "load_mcp_catalog",
    "load_trust_registry",
    "server_is_catalog_approved",
    "tool_name_allowed",
]
