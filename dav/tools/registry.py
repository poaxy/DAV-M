"""Registered tools with JSON Schema definitions."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class SideEffect(str, Enum):
    READ = "read"
    MUTATE = "mutate"
    DANGEROUS = "dangerous"


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: Dict[str, Any]
    actions: List[str]
    side_effect: SideEffect = SideEffect.MUTATE
    output_schema: Optional[Dict[str, Any]] = None
    parallel_ok: bool = False


_REGISTRY: Dict[str, ToolDefinition] = {}


def register_tool(defn: ToolDefinition) -> None:
    if defn.name in _REGISTRY:
        raise ValueError(f"Duplicate tool registration: {defn.name}")
    _REGISTRY[defn.name] = defn


def get_tool(name: str) -> Optional[ToolDefinition]:
    return _REGISTRY.get(name)


def list_tools() -> List[ToolDefinition]:
    return list(_REGISTRY.values())


def _read_file_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path relative to workspace root or absolute path under a workspace root",
            },
        },
        "required": ["path"],
        "additionalProperties": False,
    }


def _mcp_invoke_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "server_id": {"type": "string", "description": "Trusted MCP server id from mcp_trust.json"},
            "tool_name": {"type": "string", "description": "Tool name exposed by that MCP server"},
            "arguments": {
                "type": "object",
                "description": "JSON arguments for the MCP tool",
                "additionalProperties": True,
            },
        },
        "required": ["server_id", "tool_name"],
        "additionalProperties": False,
    }


def _exec_shell_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Shell command to run"},
            "cwd": {"type": "string", "description": "Working directory (optional)"},
            "use_sudo": {"type": "boolean", "description": "Whether command needs sudo"},
        },
        "required": ["command"],
        "additionalProperties": False,
    }


def _bootstrap_default_tools() -> None:
    from dav.policy.actions import EXEC_SHELL, MCP_CALL, READ_FS

    if "mcp_invoke" not in _REGISTRY:
        register_tool(
            ToolDefinition(
                name="mcp_invoke",
                description=(
                    "Call a tool on a trusted local MCP server (stdio). "
                    "Requires DAV_MCP_ENABLED=1 and ~/.dav/mcp_trust.json. "
                    "Servers run arbitrary code; only use pinned servers you trust."
                ),
                input_schema=_mcp_invoke_schema(),
                actions=[MCP_CALL],
                side_effect=SideEffect.MUTATE,
                parallel_ok=False,
            )
        )
    if "read_workspace_file" not in _REGISTRY:
        register_tool(
            ToolDefinition(
                name="read_workspace_file",
                description=(
                    "Read a text file from the workspace (read-only). "
                    "Use for inspecting source before suggesting edits."
                ),
                input_schema=_read_file_schema(),
                actions=[READ_FS],
                side_effect=SideEffect.READ,
                parallel_ok=True,
            )
        )
    if "exec_shell" not in _REGISTRY:
        register_tool(
            ToolDefinition(
                name="exec_shell",
                description=(
                    "Run one shell command on the user's system. "
                    "Use for inspection, package management, and safe automation. "
                    "Do not chain destructive operations without user intent."
                ),
                input_schema=_exec_shell_schema(),
                actions=[EXEC_SHELL],
                side_effect=SideEffect.MUTATE,
                parallel_ok=False,
            )
        )


_bootstrap_default_tools()


def openai_tools_payload() -> List[Dict[str, Any]]:
    """OpenAI Chat Completions `tools` parameter."""
    from dav.config import mcp_tools_enabled

    out: List[Dict[str, Any]] = []
    for t in list_tools():
        if t.name == "mcp_invoke" and not mcp_tools_enabled():
            continue
        out.append(
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                },
            }
        )
    return out


def anthropic_tools_payload() -> List[Dict[str, Any]]:
    """Anthropic Messages `tools` parameter."""
    from dav.config import mcp_tools_enabled

    out: List[Dict[str, Any]] = []
    for t in list_tools():
        if t.name == "mcp_invoke" and not mcp_tools_enabled():
            continue
        out.append(
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }
        )
    return out
