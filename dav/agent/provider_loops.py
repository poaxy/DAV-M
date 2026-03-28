"""Multi-turn LLM tool loops per provider (non-streaming, Phase 1)."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from dav.ai_backend import APIError
from dav.tools.dispatch import dispatch_tool_call
from dav.tools.registry import (
    SideEffect,
    anthropic_tools_payload,
    get_tool,
    openai_tools_payload,
)


def _names_parallel_ok(names: List[str]) -> bool:
    """Phase 3: only multiple READ + parallel_ok tools; never parallel with exec_shell."""
    if len(names) < 2:
        return False
    if "exec_shell" in names or "mcp_invoke" in names:
        return False
    for n in names:
        t = get_tool(n)
        if t is None or t.side_effect != SideEffect.READ or not t.parallel_ok:
            return False
    return True


def _serialize_openai_tool_calls(msg: Any) -> Optional[List[Dict[str, Any]]]:
    if not getattr(msg, "tool_calls", None):
        return None
    out: List[Dict[str, Any]] = []
    for tc in msg.tool_calls:
        try:
            out.append(tc.model_dump())
        except Exception:
            out.append(
                {
                    "id": tc.id,
                    "type": getattr(tc, "type", "function"),
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
            )
    return out


def run_openai_tool_loop(
    client: Any,
    model: str,
    user_message: str,
    system_prompt: Optional[str],
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
    max_rounds: int = 10,
) -> str:
    """OpenAI Chat Completions tool loop."""
    messages: List[Dict[str, Any]] = [{"role": "user", "content": user_message}]
    tools = openai_tools_payload()
    rounds = 0
    last_text = ""

    while rounds < max_rounds:
        rounds += 1
        api_messages: List[Dict[str, Any]] = list(messages)
        if system_prompt:
            api_messages = [{"role": "system", "content": system_prompt}] + api_messages

        resp = client.chat.completions.create(
            model=model,
            messages=api_messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=4096,
            top_p=0.9,
        )
        msg = resp.choices[0].message
        if getattr(msg, "content", None):
            last_text = (msg.content or "") or last_text

        tcalls = getattr(msg, "tool_calls", None)
        if not tcalls:
            return last_text or (msg.content or "")

        assistant_entry: Dict[str, Any] = {"role": "assistant", "content": msg.content}
        ser = _serialize_openai_tool_calls(msg)
        if ser:
            assistant_entry["tool_calls"] = ser
        messages.append(assistant_entry)

        names = [tc.function.name for tc in tcalls]
        if _names_parallel_ok(names):
            with ThreadPoolExecutor(max_workers=min(8, len(tcalls))) as pool:
                tool_results = list(
                    pool.map(
                        lambda tc: dispatch_tool_call(
                            tc.function.name,
                            tc.function.arguments or "{}",
                            execute_enabled=execute_enabled,
                            auto_confirm=auto_confirm,
                            read_only_mode=read_only_mode,
                        ),
                        tcalls,
                    )
                )
        else:
            tool_results = [
                dispatch_tool_call(
                    tc.function.name,
                    tc.function.arguments or "{}",
                    execute_enabled=execute_enabled,
                    auto_confirm=auto_confirm,
                    read_only_mode=read_only_mode,
                )
                for tc in tcalls
            ]

        for tc, tr in zip(tcalls, tool_results):
            messages.append(
                {"role": "tool", "tool_call_id": tc.id, "content": tr.to_json_str()}
            )

    return last_text


def run_anthropic_tool_loop(
    client: Any,
    model: str,
    user_message: str,
    system_prompt: Optional[str],
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
    max_rounds: int = 10,
) -> str:
    tools = anthropic_tools_payload()
    messages: List[Dict[str, Any]] = [{"role": "user", "content": user_message}]
    rounds = 0
    last_text = ""

    while rounds < max_rounds:
        rounds += 1
        kwargs: Dict[str, Any] = {
            "model": model,
            "max_tokens": 8192,
            "messages": messages,
            "tools": tools,
            "temperature": 0.3,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        resp = client.messages.create(**kwargs)
        blocks = resp.content
        text_parts: List[str] = []
        tool_uses: List[Any] = []
        for block in blocks:
            btype = getattr(block, "type", None)
            if btype == "text":
                text_parts.append(getattr(block, "text", "") or "")
            elif btype == "tool_use":
                tool_uses.append(block)

        if text_parts:
            last_text = "\n".join(text_parts)

        if not tool_uses:
            return last_text

        assistant_content = []
        for block in blocks:
            if getattr(block, "type", None) == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif getattr(block, "type", None) == "tool_use":
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    }
                )

        messages.append({"role": "assistant", "content": assistant_content})

        names_a = [tu.name for tu in tool_uses]
        if _names_parallel_ok(names_a):
            with ThreadPoolExecutor(max_workers=min(8, len(tool_uses))) as pool:
                tr_list = list(
                    pool.map(
                        lambda tu: dispatch_tool_call(
                            tu.name,
                            json.dumps(tu.input) if isinstance(tu.input, dict) else str(tu.input),
                            execute_enabled=execute_enabled,
                            auto_confirm=auto_confirm,
                            read_only_mode=read_only_mode,
                        ),
                        tool_uses,
                    )
                )
        else:
            tr_list = []
            for tu in tool_uses:
                args_json = json.dumps(tu.input) if isinstance(tu.input, dict) else str(tu.input)
                tr_list.append(
                    dispatch_tool_call(
                        tu.name,
                        args_json,
                        execute_enabled=execute_enabled,
                        auto_confirm=auto_confirm,
                        read_only_mode=read_only_mode,
                    )
                )

        tool_results: List[Dict[str, Any]] = []
        for tu, tr in zip(tool_uses, tr_list):
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": tr.to_json_str(),
                }
            )

        messages.append({"role": "user", "content": tool_results})

    return last_text


def run_gemini_tool_loop(
    genai_module: Any,
    api_key: str,
    model: str,
    user_message: str,
    system_prompt: Optional[str],
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
    max_rounds: int = 10,
) -> str:
    """Gemini function calling loop using google.generativeai protos."""
    try:
        fd_exec = genai_module.protos.FunctionDeclaration(
            name="exec_shell",
            description="Run a shell command on the user's system.",
            parameters=genai_module.protos.Schema(
                type=genai_module.protos.Type.OBJECT,
                properties={
                    "command": genai_module.protos.Schema(
                        type=genai_module.protos.Type.STRING,
                        description="Shell command to run",
                    ),
                    "cwd": genai_module.protos.Schema(type=genai_module.protos.Type.STRING),
                    "use_sudo": genai_module.protos.Schema(type=genai_module.protos.Type.BOOLEAN),
                },
                required=["command"],
            ),
        )
        fd_read = genai_module.protos.FunctionDeclaration(
            name="read_workspace_file",
            description="Read a text file under the workspace.",
            parameters=genai_module.protos.Schema(
                type=genai_module.protos.Type.OBJECT,
                properties={
                    "path": genai_module.protos.Schema(
                        type=genai_module.protos.Type.STRING,
                        description="File path",
                    ),
                },
                required=["path"],
            ),
        )
        fds: List[Any] = [fd_exec, fd_read]
        from dav.config import mcp_tools_enabled

        if mcp_tools_enabled():
            fd_mcp = genai_module.protos.FunctionDeclaration(
                name="mcp_invoke",
                description="Call a tool on a trusted MCP server (requires DAV_MCP_ENABLED and mcp_trust.json).",
                parameters=genai_module.protos.Schema(
                    type=genai_module.protos.Type.OBJECT,
                    properties={
                        "server_id": genai_module.protos.Schema(
                            type=genai_module.protos.Type.STRING,
                        ),
                        "tool_name": genai_module.protos.Schema(
                            type=genai_module.protos.Type.STRING,
                        ),
                        "arguments": genai_module.protos.Schema(
                            type=genai_module.protos.Type.OBJECT,
                        ),
                    },
                    required=["server_id", "tool_name"],
                ),
            )
            fds.append(fd_mcp)
        tool = genai_module.protos.Tool(function_declarations=fds)
    except Exception as e:
        raise APIError(f"Gemini tool setup failed: {e}") from e

    genai_module.configure(api_key=api_key)

    model_inst = genai_module.GenerativeModel(
        model_name=model,
        system_instruction=system_prompt or None,
        tools=[tool],
    )
    chat = model_inst.start_chat(enable_automatic_function_calling=False)
    response = chat.send_message(user_message)
    rounds = 0
    last_text = ""

    while rounds < max_rounds:
        rounds += 1
        parts_out: List[str] = []
        function_calls: List[Any] = []

        for cand in getattr(response, "candidates", []) or []:
            for part in getattr(getattr(cand, "content", None), "parts", []) or []:
                if getattr(part, "text", None):
                    parts_out.append(part.text)
                fn = getattr(part, "function_call", None)
                if fn:
                    function_calls.append(fn)

        if parts_out:
            last_text = "\n".join(parts_out)

        if not function_calls:
            return last_text

        names_g = [fc.name for fc in function_calls]
        if _names_parallel_ok(names_g):
            with ThreadPoolExecutor(max_workers=min(8, len(function_calls))) as pool:
                tr_list = list(
                    pool.map(
                        lambda fc: dispatch_tool_call(
                            fc.name,
                            json.dumps(dict(fc.args) if hasattr(fc, "args") and fc.args else {}),
                            execute_enabled=execute_enabled,
                            auto_confirm=auto_confirm,
                            read_only_mode=read_only_mode,
                        ),
                        function_calls,
                    )
                )
        else:
            tr_list = []
            for fc in function_calls:
                args = dict(fc.args) if hasattr(fc, "args") else {}
                args_json = json.dumps(args)
                tr_list.append(
                    dispatch_tool_call(
                        fc.name,
                        args_json,
                        execute_enabled=execute_enabled,
                        auto_confirm=auto_confirm,
                        read_only_mode=read_only_mode,
                    )
                )

        responses_parts = []
        for fc, tr in zip(function_calls, tr_list):
            responses_parts.append(
                genai_module.protos.Part(
                    function_response=genai_module.protos.FunctionResponse(
                        name=fc.name,
                        response={"result": tr.to_json_str()},
                    )
                )
            )

        response = chat.send_message(genai_module.protos.Content(parts=responses_parts))

    return last_text
