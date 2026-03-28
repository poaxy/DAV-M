"""Workspace index: walk, chunk, FTS, optional watcher."""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Callable, List, Optional, Set

from dav.index.chunking import chunk_lines
from dav.index.gitignore import default_exclude_dirs, is_ignored, load_gitignore_specs
from dav.index.store import IndexStore
from dav.index.types import ChunkHit

logger = logging.getLogger(__name__)

_TEXT_EXT = frozenset(
    {
        ".py",
        ".md",
        ".txt",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
        ".rs",
        ".go",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".css",
        ".html",
        ".sh",
        ".sql",
        ".c",
        ".h",
        ".cpp",
        ".java",
        ".rb",
        ".php",
        ".vue",
        ".xml",
        ".ini",
        ".cfg",
        ".env",
    }
)


def _is_probably_text(path: Path) -> bool:
    if path.suffix.lower() in _TEXT_EXT:
        return True
    if path.name in ("Dockerfile", "Makefile", "LICENSE", "README"):
        return True
    return False


class WorkspaceIndex:
    """Incremental FTS index over a workspace root."""

    def __init__(
        self,
        root: Path,
        data_dir: Path,
        *,
        max_file_bytes: int = 512 * 1024,
    ) -> None:
        self.root = root.resolve()
        self.data_dir = data_dir.expanduser().resolve()
        self.max_file_bytes = max_file_bytes
        self._store = IndexStore(self.data_dir / "chunks.db")
        self._specs = load_gitignore_specs(self.root)
        self._lock = threading.Lock()
        self._watcher_stop: Optional[threading.Event] = None
        self._watcher_thread: Optional[threading.Thread] = None

    def close(self) -> None:
        self.stop_watcher()
        self._store.close()

    def search(self, query: str, limit: int = 10) -> List[ChunkHit]:
        return self._store.search(query, limit=limit)

    def index_file(self, abs_path: Path) -> None:
        """Index one file if under root and not ignored."""
        try:
            abs_path = abs_path.resolve()
        except OSError:
            return
        if not str(abs_path).startswith(str(self.root)):
            return
        rel = abs_path.relative_to(self.root)
        rel_posix = rel.as_posix()
        if is_ignored(rel_posix, self._specs, is_dir=False):
            return
        if not abs_path.is_file():
            self._store.delete_path(rel_posix)
            return
        if not _is_probably_text(abs_path):
            return
        try:
            st = abs_path.stat()
        except OSError:
            return
        if st.st_size > self.max_file_bytes:
            return
        try:
            raw = abs_path.read_bytes()
        except OSError:
            return
        if b"\x00" in raw[:4096]:
            return
        try:
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            return
        sha = self._store.content_hash(text)
        mtime, size = st.st_mtime, st.st_size
        if not self._store.needs_reindex(rel_posix, sha, mtime, size):
            return
        lines = text.splitlines(keepends=True)
        ch = chunk_lines(lines, max_lines=80, overlap_lines=10, max_chars=8000)
        tuples = [(c.start_line, c.end_line, c.text) for c in ch]
        self._store.index_chunks(
            rel_posix,
            tuples,
            content_sha256=sha,
            mtime=mtime,
            size=size,
        )

    def full_scan(self, on_progress: Optional[Callable[[int], None]] = None) -> int:
        """Index all files under root. Returns number of files processed."""
        n = 0
        excl = default_exclude_dirs()
        for dirpath, dirnames, filenames in os.walk(self.root, topdown=True):
            dpath = Path(dirpath)
            # prune
            dirnames[:] = [
                d
                for d in dirnames
                if d not in excl and not d.startswith(".")
                and not is_ignored(
                    (dpath / d).relative_to(self.root).as_posix() + "/",
                    self._specs,
                    is_dir=True,
                )
            ]
            for fn in filenames:
                p = dpath / fn
                rel = p.relative_to(self.root).as_posix()
                if is_ignored(rel, self._specs, is_dir=False):
                    continue
                self.index_file(p)
                n += 1
                if on_progress and n % 50 == 0:
                    on_progress(n)
        if on_progress:
            on_progress(n)
        return n

    def start_watcher(self, debounce_s: float = 0.3) -> None:
        """Background debounced file watcher (watchdog if installed)."""
        self.stop_watcher()
        stop = threading.Event()
        self._watcher_stop = stop
        pending: Set[str] = set()
        pending_lock = threading.Lock()
        debounce_lock = threading.Lock()
        timer: List[Optional[threading.Timer]] = [None]

        def flush() -> None:
            with pending_lock:
                paths = list(pending)
                pending.clear()
            for p in paths:
                try:
                    self.index_file(Path(p))
                except Exception as e:
                    logger.debug("index_file failed: %s", e)

        def schedule_flush() -> None:
            with debounce_lock:
                if timer[0]:
                    timer[0].cancel()
                timer[0] = threading.Timer(debounce_s, flush)
                timer[0].daemon = True
                timer[0].start()

        def on_any(path: str) -> None:
            if stop.is_set():
                return
            with pending_lock:
                pending.add(path)
            schedule_flush()

        ws = self
        try:
            from watchdog.events import FileSystemEventHandler
            from watchdog.observers import Observer
        except ImportError:
            logger.info("watchdog not installed; workspace index watcher disabled")
            return

        class Handler(FileSystemEventHandler):
            def on_modified(self, event):  # type: ignore[no-untyped-def]
                if not event.is_directory:
                    on_any(event.src_path)

            def on_created(self, event):  # type: ignore[no-untyped-def]
                if not event.is_directory:
                    on_any(event.src_path)

            def on_deleted(self, event):  # type: ignore[no-untyped-def]
                if not event.is_directory:
                    try:
                        rel = Path(event.src_path).resolve().relative_to(ws.root).as_posix()
                        ws._store.delete_path(rel)
                    except Exception:
                        pass

        obs = Observer()
        h = Handler()
        obs.schedule(h, str(self.root), recursive=True)
        obs.start()

        def run() -> None:
            try:
                while not stop.is_set():
                    time.sleep(0.5)
            finally:
                obs.stop()
                obs.join(timeout=5)

        t = threading.Thread(target=run, daemon=True)
        t.start()
        self._watcher_thread = t
        # keep observer reference
        self._observer = obs  # type: ignore[attr-defined]

    def stop_watcher(self) -> None:
        if self._watcher_stop:
            self._watcher_stop.set()
            self._watcher_stop = None
        obs = getattr(self, "_observer", None)
        if obs:
            try:
                obs.stop()
                obs.join(timeout=2)
            except Exception:
                pass
            self._observer = None  # type: ignore[attr-defined]


_index_singleton: Optional[WorkspaceIndex] = None
_index_lock = threading.Lock()


def get_workspace_index() -> Optional[WorkspaceIndex]:
    return _index_singleton


def ensure_workspace_index(
    root: Path,
    data_dir: Path,
    *,
    max_file_bytes: int = 512 * 1024,
    start_watcher: bool = False,
) -> WorkspaceIndex:
    """Create or return singleton index."""
    global _index_singleton
    with _index_lock:
        if _index_singleton is not None:
            return _index_singleton
        idx = WorkspaceIndex(root, data_dir, max_file_bytes=max_file_bytes)
        idx.full_scan()
        if start_watcher:
            idx.start_watcher()
        _index_singleton = idx
        return idx
