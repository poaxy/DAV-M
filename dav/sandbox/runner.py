"""SandboxRunner: run shell commands with OS-specific isolation."""

from __future__ import annotations

import os
import platform
import subprocess
import sys
import threading
import time
from typing import List, Optional, Sequence

from dav.executor import COMMAND_TIMEOUT_SECONDS
from dav.sandbox.linux_bwrap import bwrap_available, build_bwrap_argv, default_inner_shell
from dav.sandbox.macos_seatbelt import build_macos_wrapper_if_available
from dav.sandbox.types import NetworkScope, SandboxProfile, SandboxResult


def _stream_communicate(
    proc: subprocess.Popen,
    stream_output: bool,
) -> tuple[str, str, int]:
    out_lines: List[str] = []
    err_lines: List[str] = []

    def read_stream(stream, append: List[str], file_out) -> None:
        try:
            for line in iter(stream.readline, ""):
                if not line:
                    break
                line = line.rstrip("\n\r")
                append.append(line)
                if stream_output:
                    print(line, file=file_out, flush=True)
        except Exception:
            pass

    t1 = threading.Thread(
        target=read_stream, args=(proc.stdout, out_lines, sys.stdout), daemon=True
    )
    t2 = threading.Thread(
        target=read_stream, args=(proc.stderr, err_lines, sys.stderr), daemon=True
    )
    t1.start()
    t2.start()
    start = time.time()
    try:
        proc.wait(timeout=COMMAND_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            pass
        t1.join(timeout=1)
        t2.join(timeout=1)
        return "\n".join(out_lines), "\n".join(err_lines), 124
    t1.join(timeout=2)
    t2.join(timeout=2)
    rc = proc.returncode if proc.returncode is not None else 1
    return "\n".join(out_lines), "\n".join(err_lines), rc


def run_sandboxed_command(
    command: str,
    *,
    profile: SandboxProfile,
    cwd: Optional[str],
    workspace_roots: Sequence[str],
    network: NetworkScope,
    stream_output: bool = True,
) -> SandboxResult:
    """
    Execute `command` under bubblewrap on Linux when enabled, else subprocess shell.

    FULL_ACCESS or missing bwrap: runs `sh -c command` without bwrap.
    """
    t0 = time.perf_counter()
    inner = default_inner_shell(command)

    argv: Optional[List[str]] = None
    used = False

    system = platform.system()
    if system == "Linux":
        wrapped = build_bwrap_argv(
            inner_argv=inner,
            profile=profile,
            cwd=cwd,
            workspace_roots=workspace_roots,
            network=network,
        )
        if wrapped is not None:
            argv = wrapped
            used = True
    elif system == "Darwin":
        mac = build_macos_wrapper_if_available(inner)
        if mac is not None:
            argv = mac[:-1] + inner  # if mac prepends sandbox-exec
            used = True

    if argv is None:
        argv = inner

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")

    try:
        proc = subprocess.Popen(
            argv,
            cwd=cwd if cwd else None,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr, rc = _stream_communicate(proc, stream_output=stream_output)
        ok = rc == 0
        duration_ms = (time.perf_counter() - t0) * 1000
        return SandboxResult(
            ok=ok,
            stdout=stdout,
            stderr=stderr,
            return_code=rc,
            duration_ms=duration_ms,
            used_sandbox=used,
        )
    except FileNotFoundError as e:
        duration_ms = (time.perf_counter() - t0) * 1000
        return SandboxResult(
            ok=False,
            stdout="",
            stderr=str(e),
            return_code=127,
            duration_ms=duration_ms,
            used_sandbox=used,
            detail="executable_not_found",
        )
    except Exception as e:
        duration_ms = (time.perf_counter() - t0) * 1000
        return SandboxResult(
            ok=False,
            stdout="",
            stderr=str(e),
            return_code=1,
            duration_ms=duration_ms,
            used_sandbox=used,
            detail="sandbox_error",
        )


def should_use_sandbox(profile: SandboxProfile, sandbox_mode: str) -> bool:
    """sandbox_mode: auto | on | off. Requires bubblewrap on Linux; macOS has no bwrap in PATH."""
    m = sandbox_mode.lower()
    if m == "off":
        return False
    if profile == SandboxProfile.FULL_ACCESS:
        return False
    if not bwrap_available():
        return False
    if m == "on":
        return True
    # auto: use sandbox when bwrap exists
    return True
