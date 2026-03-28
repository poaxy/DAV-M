"""Optional plugin load path: verify manifest + catalog membership (Phase 4 stub)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from dav.plugins.signing import verify_manifest_file


def load_verified_manifest(
    manifest_path: Path,
    *,
    trusted_public_key_paths: List[Path],
    approved_plugin_ids: Optional[set[str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Load JSON manifest if Ed25519 signature verifies against a trusted key.
    If approved_plugin_ids is set, manifest `name` must be in the set.
    """
    if not verify_manifest_file(manifest_path, trusted_public_key_paths):
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    name = str(data.get("name") or "").strip()
    if approved_plugin_ids is not None and name not in approved_plugin_ids:
        return None
    return data
