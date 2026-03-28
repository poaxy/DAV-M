"""Task-based model / backend selection (Phase 3)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dav.config import get_routing_config_path, routing_enabled


def _load_config() -> Optional[Dict[str, Any]]:
    path = get_routing_config_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def select_routing(user_prompt: str) -> Tuple[Optional[str], Optional[str]]:
    """
    First matching rule wins. Returns (backend, model) where None means leave unchanged.
    """
    if not routing_enabled():
        return None, None
    data = _load_config()
    if not data or not data.get("enabled"):
        return None, None
    rules: List[Dict[str, Any]] = data.get("rules") or []
    for rule in rules:
        pat = rule.get("pattern")
        if pat:
            try:
                if not re.search(str(pat), user_prompt, re.DOTALL):
                    continue
            except re.error:
                continue
        b = rule.get("backend")
        m = rule.get("model")
        if b is None and m is None:
            continue
        return (b if isinstance(b, str) else None, m if isinstance(m, str) else None)
    return None, None


def apply_routing_to_failover_backend(fb: Any, user_prompt: str) -> None:
    """Adjust FailoverAIBackend provider/model before a tool or chat turn."""
    backend, model = select_routing(user_prompt)
    if backend is None and model is None:
        return
    fm = fb.failover_manager
    if backend and backend in fm.available_providers:
        fm.current_backend = backend
    if model is not None:
        fb.initial_model = model
    fb._initialize_backend(use_initial_model=True)
