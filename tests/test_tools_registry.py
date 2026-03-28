"""Contract tests for tool registry and policy dispatch."""

from dav.policy import ActionRequest, ModeProfile, PolicyContext, evaluate
from dav.policy.actions import EXEC_SHELL
from dav.tools.registry import get_tool, list_tools, openai_tools_payload


def test_exec_shell_registered():
    tools = list_tools()
    assert any(t.name == "exec_shell" for t in tools)
    assert any(t.name == "mcp_invoke" for t in tools)
    t = get_tool("exec_shell")
    assert t is not None
    assert EXEC_SHELL in t.actions
    assert t.input_schema.get("required") == ["command"]


def test_openai_tools_payload_shape():
    payload = openai_tools_payload()
    assert len(payload) >= 2
    names = [p["function"]["name"] for p in payload]
    assert "exec_shell" in names
    assert "read_workspace_file" in names
    exec_payload = next(p for p in payload if p["function"]["name"] == "exec_shell")
    params = exec_payload["function"]["parameters"]
    assert params["type"] == "object"
    assert "command" in params["properties"]


def test_policy_read_only_denies_shell():
    dec = evaluate(
        ActionRequest(action=EXEC_SHELL, resource="ls"),
        PolicyContext(mode=ModeProfile.READ_ONLY, execute_enabled=True, auto_confirm=True),
    )
    assert dec.outcome.value == "DENY"


def test_policy_ask_when_execute_enabled():
    dec = evaluate(
        ActionRequest(action=EXEC_SHELL, resource="ls"),
        PolicyContext(mode=ModeProfile.WORKSPACE, execute_enabled=True, auto_confirm=False),
    )
    assert dec.outcome.value == "ASK"
