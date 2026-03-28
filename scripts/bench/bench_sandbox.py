#!/usr/bin/env python3
"""Rough p50/p95 timing for bare subprocess vs bubblewrap (Linux only)."""

from __future__ import annotations

import os
import statistics
import subprocess
import tempfile
import time
from pathlib import Path

from dav.sandbox.linux_bwrap import bwrap_available
from dav.sandbox.runner import run_sandboxed_command
from dav.sandbox.types import NetworkScope, SandboxProfile


def _times_ms(fn, n: int = 30) -> list[float]:
    out: list[float] = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t0) * 1000)
    return out


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        td = str(Path(td).resolve())
        cmd = "true"

        def bare() -> None:
            subprocess.run(
                [os.environ.get("SHELL", "/bin/sh"), "-c", cmd],
                cwd=td,
                capture_output=True,
                text=True,
                check=False,
            )

        def wrapped() -> None:
            run_sandboxed_command(
                cmd,
                profile=SandboxProfile.WORKSPACE_WRITE,
                cwd=td,
                workspace_roots=[td],
                network=NetworkScope.OFF,
                stream_output=False,
            )

        def _p95(sorted_vals: list[float]) -> float:
            if not sorted_vals:
                return 0.0
            i = min(len(sorted_vals) - 1, max(0, int(round(0.95 * (len(sorted_vals) - 1)))))
            return sorted_vals[i]

        b = sorted(_times_ms(bare))
        print(
            f"bare sh -c true: p50={statistics.median(b):.2f}ms p95={_p95(b):.2f}ms"
        )

        if not bwrap_available():
            print("bwrap not found; skipping sandbox row")
            return

        w = sorted(_times_ms(wrapped))
        sample = run_sandboxed_command(
            cmd,
            profile=SandboxProfile.WORKSPACE_WRITE,
            cwd=td,
            workspace_roots=[td],
            network=NetworkScope.OFF,
            stream_output=False,
        )
        print(
            f"bwrap sandbox:    p50={statistics.median(w):.2f}ms p95={_p95(w):.2f}ms "
            f"(used_sandbox={sample.used_sandbox})"
        )


if __name__ == "__main__":
    main()
