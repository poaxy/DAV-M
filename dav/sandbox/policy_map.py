"""Map policy ModeProfile to SandboxProfile."""

from __future__ import annotations

from dav.policy.types import ModeProfile
from dav.sandbox.types import SandboxProfile


def sandbox_profile_for_mode(mode: ModeProfile) -> SandboxProfile:
    if mode == ModeProfile.READ_ONLY:
        return SandboxProfile.READ_ONLY
    if mode == ModeProfile.AUTONOMOUS:
        return SandboxProfile.WORKSPACE_WRITE_NETWORK_ALLOWLIST
    return SandboxProfile.WORKSPACE_WRITE
