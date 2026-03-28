"""MCP dispatch gating (no live MCP server)."""

import json

import pytest

from dav.tools.dispatch import dispatch_tool_call


def test_mcp_invoke_disabled_by_default(monkeypatch):
    monkeypatch.delenv("DAV_MCP_ENABLED", raising=False)
    tr = dispatch_tool_call(
        "mcp_invoke",
        json.dumps({"server_id": "x", "tool_name": "y"}),
        execute_enabled=True,
        auto_confirm=True,
        read_only_mode=False,
    )
    assert tr.ok is False
    assert tr.error_code == "MCP_DISABLED"


def test_mcp_unknown_server(monkeypatch, tmp_path):
    monkeypatch.setenv("DAV_MCP_ENABLED", "1")
    trust = tmp_path / "mcp_trust.json"
    trust.write_text(json.dumps({"servers": []}), encoding="utf-8")
    monkeypatch.setenv("DAV_MCP_TRUST_CONFIG", str(trust))
    tr = dispatch_tool_call(
        "mcp_invoke",
        json.dumps({"server_id": "nope", "tool_name": "t"}),
        execute_enabled=True,
        auto_confirm=True,
        read_only_mode=False,
    )
    assert tr.ok is False
    assert tr.error_code == "MCP_TRUST"
