"""Load .gitignore-style patterns using pathspec."""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

try:
    from pathspec import PathSpec
    from pathspec.patterns import GitWildMatchPattern
except ImportError:  # pragma: no cover
    PathSpec = None  # type: ignore[misc, assignment]
    GitWildMatchPattern = None  # type: ignore[misc, assignment]


def load_gitignore_specs(root: Path) -> List[object]:
    """Return PathSpec objects from root's .gitignore chain (root only for v1)."""
    if PathSpec is None:
        return []
    specs: List[object] = []
    gi = root / ".gitignore"
    if gi.is_file():
        try:
            lines = gi.read_text(encoding="utf-8", errors="replace").splitlines()
            specs.append(PathSpec.from_lines(GitWildMatchPattern, lines))
        except OSError:
            pass
    return specs


def is_ignored(
    relative_posix: str,
    specs: List[object],
    *,
    is_dir: bool = False,
) -> bool:
    """True if path (posix, relative to root) matches any gitignore spec."""
    if not specs:
        return False
    path = relative_posix if not relative_posix.endswith("/") else relative_posix.rstrip("/")
    for spec in specs:
        try:
            if spec.match_file(path):  # type: ignore[attr-defined]
                return True
            if is_dir and spec.match_file(path + "/"):  # type: ignore[attr-defined]
                return True
        except Exception:
            continue
    return False


def default_exclude_dirs() -> frozenset[str]:
    return frozenset(
        {
            ".git",
            ".hg",
            ".svn",
            "__pycache__",
            ".venv",
            "venv",
            "node_modules",
            ".tox",
            "dist",
            "build",
            ".eggs",
        }
    )
