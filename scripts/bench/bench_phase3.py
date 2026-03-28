#!/usr/bin/env python3
"""Rough Phase 3 benchmarks: index search, tool dispatch batch (local only)."""

from __future__ import annotations

import statistics
import tempfile
import time
from pathlib import Path


def _p95(vals: list[float]) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    i = min(len(s) - 1, max(0, int(round(0.95 * (len(s) - 1)))))
    return s[i]


def main() -> None:
    from dav.index.store import IndexStore

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        store = IndexStore(td_path / "t.db")
        body = "\n".join([f"line {i} token benchmark" for i in range(500)])
        store.index_chunks(
            "f.txt",
            [(1, 500, body)],
            content_sha256=store.content_hash(body),
            mtime=1.0,
            size=len(body),
        )
        times: list[float] = []
        for _ in range(20):
            t0 = time.perf_counter()
            store.search("benchmark token", limit=10)
            times.append((time.perf_counter() - t0) * 1000)
        store.close()
        print(f"FTS search: p50={statistics.median(times):.3f}ms p95={_p95(times):.3f}ms")

    # Parallel vs sequential dispatch (read-only tools only; no API calls)
    from concurrent.futures import ThreadPoolExecutor
    from dav.tools.dispatch import dispatch_tool_call

    def one_read(i: int):
        import json

        args = json.dumps({"path": __file__})
        return dispatch_tool_call(
            "read_workspace_file",
            args,
            execute_enabled=False,
            auto_confirm=True,
            read_only_mode=False,
        )

    n = 4
    t0 = time.perf_counter()
    for i in range(n):
        one_read(i)
    seq_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=n) as pool:
        list(pool.map(one_read, range(n)))
    par_ms = (time.perf_counter() - t0) * 1000
    print(f"read_workspace_file x{n} sequential: {seq_ms:.2f}ms parallel: {par_ms:.2f}ms")


if __name__ == "__main__":
    main()
