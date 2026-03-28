"""Org-approved MCP catalog (optional enforcement, Phase 4)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from dav.config import get_mcp_catalog_path, mcp_catalog_enforced


def load_mcp_catalog(path: Optional[Path] = None) -> Dict[str, Any]:
    """Load catalog JSON; missing file → empty (no restriction unless enforce flag)."""
    p = path or get_mcp_catalog_path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def approved_server_ids(catalog: Optional[Dict[str, Any]] = None) -> Set[str]:
    data = catalog if catalog is not None else load_mcp_catalog()
    raw = data.get("approved_servers") or []
    if not isinstance(raw, list):
        return set()
    return {str(x).strip() for x in raw if str(x).strip()}


def server_is_catalog_approved(server_id: str, catalog: Optional[Dict[str, Any]] = None) -> bool:
    """If enforcement is off, always True. If on, server must be in approved_servers."""
    if not mcp_catalog_enforced():
        return True
    ids = approved_server_ids(catalog)
    if not ids:
        return False
    return server_id in ids


def required_checksum_for_server(server_id: str, catalog: Optional[Dict[str, Any]] = None) -> Optional[str]:
    data = catalog if catalog is not None else load_mcp_catalog()
    rc = data.get("required_checksums") or {}
    if not isinstance(rc, dict):
        return None
    v = rc.get(server_id)
    return str(v).strip() if v else None
