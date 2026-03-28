"""License enforcement hooks for governed tools (Phase 5)."""

from __future__ import annotations

import os
from typing import Optional

from enterprise.control_plane_client import LicenseState, build_control_plane_client

_prev_license: Optional[LicenseState] = None


def check_license_for_tool(tool_name: str) -> Optional[str]:
    """
    Return a user-visible error string if the tool must be blocked.

    read_workspace_file remains allowed in read-only license modes.
    """
    global _prev_license
    enforcement = os.getenv("DAV_LICENSE_ENFORCEMENT", "grace").strip().lower()
    client = build_control_plane_client()
    state = client.check_license()
    if _prev_license is not None and _prev_license != state:
        try:
            from dav.observability.audit import log_license_state_change

            log_license_state_change(
                _prev_license.value,
                state.value,
            )
        except Exception:
            pass
    _prev_license = state

    if state == LicenseState.VALID:
        return None
    if state == LicenseState.UNKNOWN:
        return None
    if state == LicenseState.GRACE:
        if enforcement == "block":
            return "License in grace period; mutating tools disabled (DAV_LICENSE_ENFORCEMENT=block)."
        return None

    # expired / invalid
    if tool_name == "read_workspace_file":
        return None
    if enforcement == "grace":
        return None
    if enforcement == "read_only":
        return (
            f"License state is {state.value}; only read-only tools are allowed "
            "(DAV_LICENSE_ENFORCEMENT=read_only)."
        )
    if enforcement == "block":
        return f"License state is {state.value}; execution disabled (DAV_LICENSE_ENFORCEMENT=block)."
    return None


def license_degraded_read_only() -> bool:
    """True when mutating tools should be blocked but reads OK."""
    if os.getenv("DAV_LICENSE_ENFORCEMENT", "grace").lower() != "read_only":
        return False
    st = build_control_plane_client().check_license()
    return st in (LicenseState.EXPIRED, LicenseState.INVALID)
