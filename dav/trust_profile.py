"""Local trust profile (workspace roots, suggested mode) — doc 08."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional


def trust_profile_path() -> Path:
    return Path.home() / ".dav" / "trust_profile.json"


def detect_git_root() -> Optional[Path]:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=8,
            cwd=os.getcwd(),
        )
        if out.returncode == 0 and out.stdout.strip():
            return Path(out.stdout.strip()).resolve()
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return None


def load_trust_profile() -> Dict[str, Any]:
    p = trust_profile_path()
    if not p.is_file():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_trust_profile(
    *,
    trusted_roots: List[str],
    default_mode: str,
) -> None:
    p = trust_profile_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "trusted_roots": trusted_roots,
        "default_mode": default_mode,
    }
    p.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def trust_ack_path() -> Path:
    return Path.home() / ".dav" / ".trust_ack"


def has_trust_ack() -> bool:
    return trust_ack_path().is_file()
