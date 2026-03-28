"""Aggregated usage reporting to control plane (no PII)."""

from __future__ import annotations

import atexit
import os
from typing import Optional

from enterprise.control_plane_client import UsageReport, build_control_plane_client

_session_bumped = False
_tool_invocations = 0
_flushed = False


def bump_session() -> None:
    global _session_bumped
    _session_bumped = True


def bump_tool_invocation() -> None:
    global _tool_invocations
    _tool_invocations += 1


def _flush() -> None:
    global _flushed
    if _flushed:
        return
    _flushed = True
    if os.getenv("DAV_USAGE_REPORTING", "1").strip().lower() in ("0", "false", "no"):
        return
    try:
        client = build_control_plane_client()
        report = UsageReport(
            session_count=1 if _session_bumped else 0,
            tool_invocation_count=_tool_invocations,
        )
        client.report_usage(report)
    except Exception:
        pass


def register_atexit_flush() -> None:
    atexit.register(_flush)
