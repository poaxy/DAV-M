"""Workspace index FTS store tests."""

from pathlib import Path

import pytest

from dav.index.chunking import chunk_lines
from dav.index.store import IndexStore, tokenize_query_for_fts


def test_chunk_lines_overlap():
    lines = [f"line{i}\n" for i in range(100)]
    ch = chunk_lines(lines, max_lines=20, overlap_lines=5)
    assert len(ch) >= 2
    assert ch[0].start_line == 1


def test_fts_index_search(tmp_path: Path):
    db = tmp_path / "x.db"
    store = IndexStore(db)
    store.index_chunks(
        "src/a.py",
        [(1, 5, "def hello():\n    return 42\n"), (6, 10, "class Foo:\n    pass\n")],
        content_sha256="abc",
        mtime=1.0,
        size=100,
    )
    hits = store.search("hello", limit=5)
    assert len(hits) >= 1
    assert "a.py" in hits[0].path
    store.close()


def test_tokenize_query():
    assert "AND" in tokenize_query_for_fts("foo bar")
