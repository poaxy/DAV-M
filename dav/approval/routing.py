"""Role-based approval routing (config-first; SSO later)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Optional


def _roles_path() -> Path:
    base = os.getenv("DAV_APPROVAL_ROLES_PATH")
    if base:
        return Path(base).expanduser()
    return Path.home() / ".dav" / "org" / "approval_roles.json"


def load_role_mapping() -> Dict[str, List[str]]:
    """Map role name -> list of OS usernames allowed to approve."""
    path = _roles_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    roles = data.get("roles")
    if isinstance(roles, dict):
        out: Dict[str, List[str]] = {}
        for k, v in roles.items():
            if isinstance(v, list):
                out[str(k)] = [str(x) for x in v]
            elif isinstance(v, dict) and "os_users" in v:
                u = v.get("os_users")
                if isinstance(u, list):
                    out[str(k)] = [str(x) for x in u]
        return out
    return {}


def can_user_approve(required_role: Optional[str], os_user: str) -> bool:
    """If no role required, any user can approve interactive prompts."""
    if not required_role:
        return True
    mapping = load_role_mapping()
    if not mapping:
        return True
    allowed = mapping.get(required_role) or mapping.get(required_role.lower())
    if not allowed:
        return False
    return os_user in allowed
