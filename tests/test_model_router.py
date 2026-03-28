"""Model routing (Phase 3)."""

import json
from pathlib import Path

from dav.model_router.routing import select_routing


def test_select_routing_disabled(monkeypatch):
    monkeypatch.delenv("DAV_ROUTING_ENABLED", raising=False)
    assert select_routing("explain the moon") == (None, None)


def test_select_routing_rule(tmp_path: Path, monkeypatch):
    p = tmp_path / "r.json"
    p.write_text(
        json.dumps(
            {
                "enabled": True,
                "rules": [
                    {"pattern": "(?i)explain", "backend": "openai", "model": "gpt-4o-mini"},
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("DAV_ROUTING_ENABLED", "1")
    monkeypatch.setenv("DAV_ROUTING_CONFIG", str(p))
    b, m = select_routing("please explain recursion")
    assert b == "openai"
    assert m == "gpt-4o-mini"
