"""macOS sandbox — best-effort.

`sandbox-exec` and Seatbelt profiles are deprecated for third-party use but still
present on many systems. True parity with Linux bubblewrap is not guaranteed.

Phase 2: no-op wrapper (passthrough) with optional future `sandbox-exec` hook.
"""

from __future__ import annotations

import platform
import shutil
from typing import List, Optional


def seatbelt_available() -> bool:
    if platform.system() != "Darwin":
        return False
    return shutil.which("sandbox-exec") is not None


def build_macos_wrapper_if_available(inner_argv: List[str]) -> Optional[List[str]]:
    """
    Return argv prefixed with sandbox-exec, or None to run inner_argv directly.

    Default None (passthrough): avoids broken half-sandboxed shells without a
    curated .sb profile per workspace.
    """
    return None
