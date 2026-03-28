"""MCP_CALL policy rules."""

from dav.policy import ActionRequest, ModeProfile, PolicyContext, evaluate
from dav.policy.actions import MCP_CALL


def test_mcp_denied_read_only():
    dec = evaluate(
        ActionRequest(action=MCP_CALL, resource="s::t", metadata={"server_id": "s", "tool_name": "t"}),
        PolicyContext(mode=ModeProfile.READ_ONLY, execute_enabled=True, auto_confirm=True),
    )
    assert dec.outcome.value == "DENY"


def test_mcp_denied_execute_disabled():
    dec = evaluate(
        ActionRequest(action=MCP_CALL, resource="s::t"),
        PolicyContext(mode=ModeProfile.WORKSPACE, execute_enabled=False, auto_confirm=False),
    )
    assert dec.outcome.value == "DENY"


def test_mcp_ask_workspace():
    dec = evaluate(
        ActionRequest(action=MCP_CALL, resource="s::t"),
        PolicyContext(mode=ModeProfile.WORKSPACE, execute_enabled=True, auto_confirm=False),
    )
    assert dec.outcome.value == "ASK"


def test_mcp_allow_auto_confirm():
    dec = evaluate(
        ActionRequest(action=MCP_CALL, resource="s::t"),
        PolicyContext(mode=ModeProfile.WORKSPACE, execute_enabled=True, auto_confirm=True),
    )
    assert dec.outcome.value == "ALLOW"
