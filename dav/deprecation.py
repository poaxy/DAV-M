"""Deprecation warnings for features moving to optional packs."""

from __future__ import annotations

import threading
from typing import Set

_warned: Set[str] = set()
_lock = threading.Lock()


def warn_deprecated(feature: str, message: str) -> None:
    """Emit a yellow warning once per process per feature key."""
    with _lock:
        if feature in _warned:
            return
        _warned.add(feature)
    from rich.console import Console

    Console().print(f"[yellow]Deprecation:[/yellow] {message}")
