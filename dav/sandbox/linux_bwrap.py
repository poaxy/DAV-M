"""Linux bubblewrap (`bwrap`) argv builder.

Security depends entirely on flags (see https://github.com/containers/bubblewrap).
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import List, Optional, Sequence

from dav.sandbox.types import NetworkScope, SandboxProfile


def bwrap_available() -> bool:
    return shutil.which("bwrap") is not None


def _expand(p: str) -> str:
    return str(Path(p).expanduser().resolve())


def build_bwrap_argv(
    *,
    inner_argv: List[str],
    profile: SandboxProfile,
    cwd: Optional[str],
    workspace_roots: Sequence[str],
    network: NetworkScope,
) -> Optional[List[str]]:
    """
    Build `bwrap ... -- inner_argv` or None if sandbox should be skipped (full_access).
    """
    if profile == SandboxProfile.FULL_ACCESS:
        return None

    if not bwrap_available():
        return None

    argv: List[str] = ["bwrap"]

    argv.extend(["--unshare-pid"])
    argv.append("--new-session")

    if network == NetworkScope.OFF:
        argv.append("--unshare-net")

    # Minimal dev/proc/tmp (common bwrap pattern)
    argv.extend(["--proc", "/proc"])
    argv.extend(["--dev", "/dev"])
    argv.extend(["--tmpfs", "/tmp"])

    # System read-only roots (typical FHS paths; skip if missing on host)
    for sys_path in ("/usr", "/bin", "/sbin", "/lib", "/lib64", "/opt"):
        p = Path(sys_path)
        if p.is_dir():
            argv.extend(["--ro-bind", sys_path, sys_path])

    # /etc often needed for nss, terminfo — read-only
    if Path("/etc").is_dir():
        argv.extend(["--ro-bind", "/etc", "/etc"])

    roots = list(workspace_roots) or []
    if cwd:
        roots.append(cwd)
    seen = set()
    rw = profile in (
        SandboxProfile.WORKSPACE_WRITE,
        SandboxProfile.WORKSPACE_WRITE_NETWORK_ALLOWLIST,
    )
    for raw in roots:
        if not raw:
            continue
        path = _expand(raw)
        if path in seen:
            continue
        seen.add(path)
        pp = Path(path)
        bind_flag = "--bind" if rw else "--ro-bind"
        if pp.is_dir():
            argv.extend([bind_flag, path, path])
        elif pp.is_file():
            parent = str(pp.parent)
            argv.extend([bind_flag, parent, parent])

    if cwd:
        argv.extend(["--chdir", _expand(cwd)])

    argv.append("--")
    argv.extend(inner_argv)
    return argv


def default_inner_shell(command: str) -> List[str]:
    """Run command via `sh -c` for predictable parsing."""
    shell = os.environ.get("SHELL", "/bin/sh")
    if Path(shell).exists():
        return [shell, "-c", command]
    return ["/bin/sh", "-c", command]
