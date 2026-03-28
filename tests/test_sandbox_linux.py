"""Linux bubblewrap sandbox integration tests (skipped when `bwrap` is absent)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from dav.sandbox.linux_bwrap import bwrap_available
from dav.sandbox.runner import run_sandboxed_command
from dav.sandbox.types import NetworkScope, SandboxProfile

pytestmark = pytest.mark.skipif(not bwrap_available(), reason="bubblewrap (bwrap) not installed")


def test_sandbox_echo():
    with tempfile.TemporaryDirectory() as td:
        td = str(Path(td).resolve())
        sr = run_sandboxed_command(
            'echo hello',
            profile=SandboxProfile.WORKSPACE_WRITE,
            cwd=td,
            workspace_roots=[td],
            network=NetworkScope.OFF,
            stream_output=False,
        )
        assert sr.used_sandbox is True
        assert sr.ok is True
        assert "hello" in (sr.stdout or "")


def test_network_off_blocks_egress():
    """With NetworkScope.OFF, bwrap uses --unshare-net; outbound TCP should fail."""
    with tempfile.TemporaryDirectory() as td:
        td = str(Path(td).resolve())
        sr = run_sandboxed_command(
            "python3 -c \"import socket; s=socket.socket(); s.settimeout(2); s.connect(('1.1.1.1', 443))\"",
            profile=SandboxProfile.WORKSPACE_WRITE,
            cwd=td,
            workspace_roots=[td],
            network=NetworkScope.OFF,
            stream_output=False,
        )
        assert sr.used_sandbox is True
        assert sr.ok is False


def test_read_only_cannot_write_workspace():
    with tempfile.TemporaryDirectory() as td:
        td = str(Path(td).resolve())
        f = Path(td) / "x"
        sr = run_sandboxed_command(
            f"touch {f}",
            profile=SandboxProfile.READ_ONLY,
            cwd=td,
            workspace_roots=[td],
            network=NetworkScope.OFF,
            stream_output=False,
        )
        assert sr.used_sandbox is True
        assert sr.ok is False
        assert not f.exists()
