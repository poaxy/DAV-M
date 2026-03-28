"""Central policy evaluation (ALLOW / ASK / DENY)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from dav.policy.actions import EXEC_SHELL, MCP_CALL, READ_FS
from dav.policy.bundle import bundle_denies_action, get_active_policy_bundle
from dav.policy.types import ActionRequest, DecisionOutcome, ModeProfile, PolicyContext, PolicyDecision

if TYPE_CHECKING:
    pass


def evaluate(request: ActionRequest, context: PolicyContext) -> PolicyDecision:
    """
    Evaluate a single action request.

    Pipeline order (blueprint):
    1. Hard deny rules
    2. Org policy bundle deny rules
    3. Workspace/path constraints (stub)
    4. Mode policy
    5. User/org allow rules (stub)
    6. Dynamic risk (stub)
    7. ASK when confirmation required
    """
    bundle = get_active_policy_bundle()
    denied = bundle_denies_action(bundle, request)
    if denied:
        return denied

    if request.action == EXEC_SHELL:
        if context.mode == ModeProfile.READ_ONLY:
            return PolicyDecision(
                outcome=DecisionOutcome.DENY,
                reason_code="POLICY_DENY_MODE",
                detail="Shell execution not allowed in read-only mode",
            )
        if not context.execute_enabled:
            return PolicyDecision(
                outcome=DecisionOutcome.DENY,
                reason_code="POLICY_DENY_EXECUTE_DISABLED",
                detail="Execution is disabled for this request",
            )
        if context.auto_confirm:
            return PolicyDecision(
                outcome=DecisionOutcome.ALLOW,
                reason_code="POLICY_ALLOW_AUTO_CONFIRM",
            )
        return PolicyDecision(
            outcome=DecisionOutcome.ASK,
            reason_code="POLICY_ASK_CONFIRMATION",
            detail="User confirmation required before running shell command",
        )

    if request.action == MCP_CALL:
        if context.mode == ModeProfile.READ_ONLY:
            return PolicyDecision(
                outcome=DecisionOutcome.DENY,
                reason_code="POLICY_DENY_MODE",
                detail="MCP tool calls are not allowed in read-only mode",
            )
        if not context.execute_enabled:
            return PolicyDecision(
                outcome=DecisionOutcome.DENY,
                reason_code="POLICY_DENY_EXECUTE_DISABLED",
                detail="MCP invocation requires execution to be enabled",
            )
        if context.auto_confirm:
            return PolicyDecision(
                outcome=DecisionOutcome.ALLOW,
                reason_code="POLICY_ALLOW_AUTO_CONFIRM",
            )
        return PolicyDecision(
            outcome=DecisionOutcome.ASK,
            reason_code="POLICY_ASK_MCP",
            detail="User confirmation required before MCP tool invocation",
        )

    # Default: non-exec actions allow in workspace+ modes
    if context.mode == ModeProfile.READ_ONLY and request.action != READ_FS:
        return PolicyDecision(
            outcome=DecisionOutcome.DENY,
            reason_code="POLICY_DENY_MODE",
            detail="Action not permitted in read-only mode",
        )

    return PolicyDecision(outcome=DecisionOutcome.ALLOW, reason_code="POLICY_ALLOW_DEFAULT")
