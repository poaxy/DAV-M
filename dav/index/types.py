"""Workspace index types (Phase 3)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChunkHit:
    """Single search hit from the workspace FTS index."""

    path: str
    line_start: int
    line_end: int
    snippet: str
    rank: float
