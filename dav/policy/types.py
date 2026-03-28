"""Policy types: requests, decisions, and runtime context."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from dav.sandbox.types import NetworkScope, SandboxProfile


class DecisionOutcome(str, Enum):
    ALLOW = "ALLOW"
    ASK = "ASK"
    DENY = "DENY"


class ModeProfile(str, Enum):
    """High-level operating mode (Phase 0 skeleton; expanded in later phases)."""

    READ_ONLY = "read_only"
    WORKSPACE = "workspace"
    AUTONOMOUS = "autonomous"


@dataclass
class PolicyContext:
    """Immutable inputs for policy evaluation."""

    mode: ModeProfile = ModeProfile.WORKSPACE
    execute_enabled: bool = False
    auto_confirm: bool = False
    workspace_roots: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)
    # Phase 2: optional sandbox + network (resolved in dispatch if unset)
    sandbox_profile: Optional["SandboxProfile"] = None
    network_scope: Optional["NetworkScope"] = None
    # Phase 5: org policy bundle metadata (for audit correlation)
    policy_bundle_version: Optional[str] = None
    policy_bundle_hash: Optional[str] = None
    org_id: Optional[str] = None


@dataclass
class ActionRequest:
    """Single authorization request."""

    action: str
    resource: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PolicyDecision:
    """Result of policy evaluation."""

    outcome: DecisionOutcome
    reason_code: str
    detail: Optional[str] = None
