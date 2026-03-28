"""SQLite FTS5 backing store for workspace chunks."""

from __future__ import annotations

import hashlib
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import List, Optional

from dav.index.types import ChunkHit


def _fts5_escape(term: str) -> str:
    """Escape user query for FTS5 MATCH (quote phrase)."""
    t = term.strip()
    if not t:
        return ""
    # FTS5: double-quote internal quotes
    t = t.replace('"', '""')
    return f'"{t}"'


class IndexStore:
    """Thread-safe FTS index over file chunks."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS files (
                    path TEXT PRIMARY KEY,
                    content_sha256 TEXT NOT NULL,
                    mtime REAL NOT NULL,
                    size INTEGER NOT NULL,
                    indexed_at REAL NOT NULL
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    path UNINDEXED,
                    line_start UNINDEXED,
                    line_end UNINDEXED,
                    body,
                    tokenize = 'porter unicode61'
                );
                """
            )
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def file_fingerprint(self, path: Path) -> tuple[float, int]:
        try:
            st = path.stat()
            return (st.st_mtime, st.st_size)
        except OSError:
            return (0.0, -1)

    def content_hash(self, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()

    def needs_reindex(self, rel_path: str, sha256: str, mtime: float, size: int) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT content_sha256, mtime, size FROM files WHERE path = ?",
                (rel_path,),
            ).fetchone()
        if row is None:
            return True
        return row[0] != sha256 or abs(row[1] - mtime) > 1e-6 or row[2] != size

    def delete_path(self, rel_path: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM chunks_fts WHERE path = ?", (rel_path,))
            self._conn.execute("DELETE FROM files WHERE path = ?", (rel_path,))
            self._conn.commit()

    def index_chunks(
        self,
        rel_path: str,
        chunks: List[tuple[int, int, str]],
        *,
        content_sha256: str,
        mtime: float,
        size: int,
    ) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM chunks_fts WHERE path = ?", (rel_path,))
            self._conn.execute("DELETE FROM files WHERE path = ?", (rel_path,))
            for ls, le, body in chunks:
                self._conn.execute(
                    "INSERT INTO chunks_fts(path, line_start, line_end, body) VALUES (?,?,?,?)",
                    (rel_path, ls, le, body),
                )
            self._conn.execute(
                """INSERT OR REPLACE INTO files(path, content_sha256, mtime, size, indexed_at)
                   VALUES (?,?,?,?,?)""",
                (rel_path, content_sha256, mtime, size, time.time()),
            )
            self._conn.commit()

    def search(self, query: str, limit: int = 10) -> List[ChunkHit]:
        q = tokenize_query_for_fts(query) or _fts5_escape(query)
        if not q:
            return []
        with self._lock:
            try:
                cur = self._conn.execute(
                    """
                    SELECT path, line_start, line_end,
                           snippet(chunks_fts, 0, '[', ']', ' ... ', 24) AS snip,
                           rank AS rk
                    FROM chunks_fts
                    WHERE chunks_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                    """,
                    (q, limit),
                )
                rows = cur.fetchall()
            except sqlite3.OperationalError:
                return []

        hits: List[ChunkHit] = []
        for r in rows:
            hits.append(
                ChunkHit(
                    path=r["path"],
                    line_start=int(r["line_start"]),
                    line_end=int(r["line_end"]),
                    snippet=r["snip"] or "",
                    rank=float(r["rk"]),
                )
            )
        return hits


def tokenize_query_for_fts(query: str) -> str:
    """Build AND-of-token FTS query (body column only indexed)."""
    words = re.findall(r"[\w\.\-/]+", query, re.UNICODE)
    if not words:
        return ""
    parts: List[str] = []
    for w in words[:12]:
        w = w.replace('"', '""')
        parts.append(f'"{w}"')
    return " AND ".join(parts)
