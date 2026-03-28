"""Line-based chunking with overlap."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class TextChunk:
    start_line: int  # 1-based inclusive
    end_line: int  # 1-based inclusive
    text: str


def chunk_lines(
    lines: List[str],
    *,
    max_lines: int = 80,
    overlap_lines: int = 10,
    max_chars: int = 8000,
) -> List[TextChunk]:
    """Split a file into overlapping line windows."""
    if not lines:
        return []
    out: List[TextChunk] = []
    n = len(lines)
    step = max(1, max_lines - overlap_lines)
    i = 0
    while i < n:
        end = min(n, i + max_lines)
        block = lines[i:end]
        text = "".join(block)
        if len(text) > max_chars:
            text = text[:max_chars]
        out.append(
            TextChunk(
                start_line=i + 1,
                end_line=i + len(block),
                text=text,
            )
        )
        if end >= n:
            break
        i += step
    return out
