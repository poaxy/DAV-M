"""Redact secrets from text before model feedback or audit export."""

from __future__ import annotations

import re
from typing import Iterable, List, Optional, Pattern

# API key–like patterns (conservative; may redact non-secrets occasionally)
_PATTERNS: List[Pattern[str]] = [
    re.compile(r"\b(sk-[A-Za-z0-9]{20,})\b"),
    re.compile(r"\b(sk-ant-[A-Za-z0-9\-]{20,})\b"),
    re.compile(r"\b(AIza[0-9A-Za-z\-_]{20,})\b"),
    re.compile(r"\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b"),
    re.compile(r"(?i)\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*([^\s'\"]{4,})"),
]


def redact_secrets(text: str, extra_patterns: Optional[Iterable[Pattern[str]]] = None) -> str:
    """Replace likely secrets with [REDACTED]."""
    if not text:
        return text
    result = text
    for pat in _PATTERNS:
        result = pat.sub("[REDACTED]", result)
    if extra_patterns:
        for pat in extra_patterns:
            result = pat.sub("[REDACTED]", result)
    return result
