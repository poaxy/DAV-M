"""Runtime audit context (session, correlation, org, actor) for structured events."""

from __future__ import annotations

import contextvars
import getpass
import hashlib
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

AUDIT_SCHEMA_VERSION = 2


@dataclass
class AuditRuntimeContext:
    """Fields merged into every audit record when set."""

    session_id: Optional[str] = None
    correlation_id: Optional[str] = None
    org_id: Optional[str] = None
    actor: Optional[str] = None
    policy_bundle_version: Optional[str] = None
    policy_bundle_hash: Optional[str] = None
    tenant_id: Optional[str] = None
    data_classification: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


_ctx: contextvars.ContextVar[Optional[AuditRuntimeContext]] = contextvars.ContextVar(
    "dav_audit_runtime", default=None
)


def get_audit_runtime() -> AuditRuntimeContext:
    c = _ctx.get()
    if c is None:
        c = AuditRuntimeContext(actor=_default_actor())
        _ctx.set(c)
    return c


def _default_actor() -> str:
    return os.getenv("DAV_AUDIT_ACTOR") or getpass.getuser()


def reset_audit_runtime(ctx: Optional[AuditRuntimeContext] = None) -> None:
    _ctx.set(ctx)


def ensure_correlation_id() -> str:
    r = get_audit_runtime()
    if not r.correlation_id:
        r.correlation_id = str(uuid.uuid4())
    return r.correlation_id


def new_correlation_id() -> str:
    r = get_audit_runtime()
    r.correlation_id = str(uuid.uuid4())
    return r.correlation_id


def machine_id_hash() -> str:
    """Opaque machine identifier for enterprise analytics (not PII)."""
    raw = os.getenv("DAV_MACHINE_ID")
    if raw:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    try:
        import platform  # noqa: PLC0415

        blob = f"{platform.node()}|{platform.system()}".encode("utf-8", errors="replace")
    except Exception:
        blob = b"unknown"
    return hashlib.sha256(blob).hexdigest()[:16]
