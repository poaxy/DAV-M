"""Org policy bundle: JSON format, loader, and integration with evaluation."""

from __future__ import annotations

import fnmatch
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from dav.policy.types import ActionRequest, DecisionOutcome, PolicyDecision

# Lazy cache
_bundle_cache: Optional["PolicyBundle"] = None
_bundle_raw_hash: Optional[str] = None


@dataclass
class PolicyBundle:
    """Parsed org policy bundle (Phase 5)."""

    schema_version: int = 1
    version: str = "0.0.0"
    hash: str = ""
    org_id: Optional[str] = None
    deny_rules: List[Dict[str, Any]] = field(default_factory=list)
    require_approval_role: Dict[str, str] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict)


def _parse_bundle(data: Dict[str, Any], raw_bytes: bytes) -> PolicyBundle:
    rules = data.get("rules") or {}
    deny = rules.get("deny_actions") or data.get("deny_actions") or []
    roles = rules.get("require_approval_role") or data.get("require_approval_role") or {}
    ver = str(data.get("version") or "0.0.0")
    h = str(data.get("hash") or "").strip()
    if not h:
        h = hashlib.sha256(raw_bytes).hexdigest()
    return PolicyBundle(
        schema_version=int(data.get("schema_version") or 1),
        version=ver,
        hash=h,
        org_id=data.get("org_id"),
        deny_rules=list(deny) if isinstance(deny, list) else [],
        require_approval_role=dict(roles) if isinstance(roles, dict) else {},
        raw=data,
    )


def load_policy_bundle_from_bytes(raw: bytes) -> PolicyBundle:
    if not raw.strip():
        return PolicyBundle()
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        return PolicyBundle()
    return _parse_bundle(data, raw)


def get_active_policy_bundle() -> PolicyBundle:
    """Load from DAV_POLICY_BUNDLE_PATH or ~/.dav/org/policy.json or control plane."""
    global _bundle_cache, _bundle_raw_hash
    try:
        from enterprise.control_plane_client import build_control_plane_client  # noqa: PLC0415

        raw = build_control_plane_client().fetch_policy()
    except Exception:
        raw = b"{}"
    h = hashlib.sha256(raw).hexdigest()
    if _bundle_cache is not None and _bundle_raw_hash == h:
        return _bundle_cache
    _bundle_raw_hash = h
    _bundle_cache = load_policy_bundle_from_bytes(raw)
    if not _bundle_cache.hash:
        _bundle_cache.hash = hashlib.sha256(raw).hexdigest()
    return _bundle_cache


def clear_policy_bundle_cache() -> None:
    global _bundle_cache, _bundle_raw_hash
    _bundle_cache = None
    _bundle_raw_hash = None


def bundle_denies_action(bundle: PolicyBundle, request: ActionRequest) -> Optional[PolicyDecision]:
    """Return DENY if a deny rule matches."""
    for rule in bundle.deny_rules:
        if not isinstance(rule, dict):
            continue
        act = str(rule.get("action") or "")
        if act and act != request.action:
            continue
        pat = str(rule.get("resource_glob") or "*")
        res = request.resource or ""
        if fnmatch.fnmatch(res, pat):
            return PolicyDecision(
                outcome=DecisionOutcome.DENY,
                reason_code="POLICY_DENY_ORG_BUNDLE",
                detail=rule.get("reason") or "Denied by organization policy",
            )
    return None


def required_approval_role(bundle: PolicyBundle, action: str) -> Optional[str]:
    return bundle.require_approval_role.get(action) or bundle.require_approval_role.get("*")
