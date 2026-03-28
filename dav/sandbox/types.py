"""Sandbox profiles and execution results (Phase 2)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class SandboxProfile(str, Enum):
    """OS-level isolation profile (see local/plans/04-security-policy-sandbox-and-secrets.md)."""

    READ_ONLY = "read_only"
    WORKSPACE_WRITE = "workspace_write"
    WORKSPACE_WRITE_NETWORK_ALLOWLIST = "workspace_write_network_allowlist"
    FULL_ACCESS = "full_access"


class NetworkScope(str, Enum):
    """Network egress for sandboxed subprocesses (Phase 2 minimal)."""

    OFF = "off"  # e.g. bwrap --unshare-net
    OPEN = "open"  # no network namespace isolation (not per-domain filtering yet)


@dataclass
class SandboxResult:
    """Outcome of running a command inside a sandbox (or passthrough)."""

    ok: bool
    stdout: str
    stderr: str
    return_code: int
    duration_ms: float
    used_sandbox: bool
    detail: Optional[str] = None
