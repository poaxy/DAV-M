"""Load minimal network egress policy from ~/.dav/network_policy.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from dav.sandbox.types import NetworkScope

_DEFAULT: Dict[str, Any] = {"egress": "off", "allowlist_domains": []}


def network_policy_path() -> Path:
    return Path.home() / ".dav" / "network_policy.json"


def load_network_policy() -> Dict[str, Any]:
    path = network_policy_path()
    if not path.exists():
        return dict(_DEFAULT)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return dict(_DEFAULT)
        out = dict(_DEFAULT)
        out.update(data)
        return out
    except Exception:
        return dict(_DEFAULT)


def egress_to_scope(egress: str) -> NetworkScope:
    e = (egress or "off").lower().strip()
    if e in ("open", "allow_all", "unrestricted"):
        return NetworkScope.OPEN
    return NetworkScope.OFF


def allowlist_domains() -> List[str]:
    p = load_network_policy()
    raw = p.get("allowlist_domains") or []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return []
