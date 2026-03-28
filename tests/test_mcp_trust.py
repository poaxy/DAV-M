"""MCP trust registry."""

import json
from pathlib import Path

from dav.mcp.trust import load_trust_registry, tool_name_allowed
from dav.mcp.catalog import approved_server_ids, load_mcp_catalog, server_is_catalog_approved


def test_load_trust_empty(tmp_path: Path):
    assert load_trust_registry(tmp_path / "nope.json") == {}


def test_load_trust_roundtrip(tmp_path: Path):
    p = tmp_path / "t.json"
    p.write_text(
        json.dumps(
            {
                "servers": [
                    {
                        "server_id": "demo",
                        "command": "echo",
                        "args": ["mcp"],
                        "allowed_tools": ["read_*"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    reg = load_trust_registry(p)
    assert "demo" in reg
    assert reg["demo"].command == "echo"
    assert tool_name_allowed(reg["demo"], "read_file")
    assert not tool_name_allowed(reg["demo"], "exec")


def test_catalog_enforce(monkeypatch, tmp_path: Path):
    cat = tmp_path / "c.json"
    cat.write_text(json.dumps({"approved_servers": ["a"]}), encoding="utf-8")
    monkeypatch.setenv("DAV_MCP_CATALOG_ENFORCE", "1")
    monkeypatch.setenv("DAV_MCP_CATALOG_PATH", str(cat))
    data = load_mcp_catalog(cat)
    assert "a" in approved_server_ids(data)
    assert server_is_catalog_approved("a", data)
    assert not server_is_catalog_approved("b", data)
