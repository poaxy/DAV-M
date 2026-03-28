"""Audit log export and optional CEF formatting."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, TextIO


def _parse_iso(ts: str) -> Optional[datetime]:
    ts = ts.strip()
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except Exception:
        return None


def _in_range(
    record_ts: str,
    since: Optional[datetime],
    until: Optional[datetime],
) -> bool:
    t = _parse_iso(record_ts)
    if t is None:
        return True
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    if since and t < since:
        return False
    if until and t > until:
        return False
    return True


def iter_audit_records(path: Path) -> Iterable[Dict[str, Any]]:
    if not path.is_file():
        return
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if isinstance(rec, dict):
                    yield rec
            except Exception:
                continue


def run_audit_export(
    *,
    since: Optional[str] = None,
    until: Optional[str] = None,
    types: Optional[str] = None,
    output: Optional[Path] = None,
    cef: bool = False,
    audit_path: Optional[Path] = None,
) -> None:
    from dav.observability.audit import _audit_path  # noqa: PLC0415

    path = audit_path or _audit_path()
    since_dt = _parse_iso(since) if since else None
    until_dt = _parse_iso(until) if until else None
    type_set: Optional[Set[str]] = None
    if types:
        type_set = {x.strip() for x in types.split(",") if x.strip()}

    out: TextIO
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        out = open(output, "w", encoding="utf-8")
    else:
        out = sys.stdout

    try:
        for rec in iter_audit_records(path):
            ts = str(rec.get("ts") or "")
            if not _in_range(ts, since_dt, until_dt):
                continue
            et = str(rec.get("type") or "")
            if type_set and et not in type_set:
                continue
            if cef:
                out.write(_to_cef(rec) + "\n")
            else:
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    finally:
        if output:
            out.close()


def _to_cef(rec: Dict[str, Any]) -> str:
    """Map a JSON audit record to a single CEF line (subset)."""
    severity = 5
    et = str(rec.get("type") or "unknown")
    name = et.replace(".", "_")
    ext_parts: List[str] = []
    for k, v in rec.items():
        if k in ("type",):
            continue
        if isinstance(v, (dict, list)):
            v = json.dumps(v, ensure_ascii=False)
        else:
            v = str(v)
        k2 = k.replace(" ", "_")
        ext_parts.append(f"{k2}={_cef_escape(v)}")
    ext = " ".join(ext_parts)
    return (
        f"CEF:0|Dav|dav-ai|1.0|{name}|{et}|{severity}|{ext}"
    )


def _cef_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("=", "\\=")
