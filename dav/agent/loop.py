"""High-level tool agent runner with optional provider failover."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from dav.agent.provider_loops import (
    run_anthropic_tool_loop,
    run_gemini_tool_loop,
    run_openai_tool_loop,
)
from dav.ai_backend import AIBackend, APIError
from dav.failover import is_failover_error
from dav.terminal import render_warning

if TYPE_CHECKING:
    from dav.ai_backend import FailoverAIBackend


def run_tool_agent(
    backend: AIBackend,
    user_prompt: str,
    system_prompt: Optional[str],
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
    max_rounds: int = 10,
) -> str:
    """Run multi-turn tool loop for the active provider."""
    name = backend.backend
    if name == "openai":
        return run_openai_tool_loop(
            backend.client,
            backend.model,
            user_prompt,
            system_prompt,
            execute_enabled=execute_enabled,
            auto_confirm=auto_confirm,
            read_only_mode=read_only_mode,
            max_rounds=max_rounds,
        )
    if name == "anthropic":
        return run_anthropic_tool_loop(
            backend.client,
            backend.model,
            user_prompt,
            system_prompt,
            execute_enabled=execute_enabled,
            auto_confirm=auto_confirm,
            read_only_mode=read_only_mode,
            max_rounds=max_rounds,
        )
    if name == "gemini":
        import google.generativeai as genai

        return run_gemini_tool_loop(
            genai,
            backend.api_key,
            backend.model,
            user_prompt,
            system_prompt,
            execute_enabled=execute_enabled,
            auto_confirm=auto_confirm,
            read_only_mode=read_only_mode,
            max_rounds=max_rounds,
        )
    raise ValueError(f"Unsupported backend for tool agent: {name}")


def run_tool_agent_with_failover(
    fb: "FailoverAIBackend",
    user_prompt: str,
    system_prompt: Optional[str],
    *,
    execute_enabled: bool,
    auto_confirm: bool,
    read_only_mode: bool,
    max_rounds: int = 10,
) -> str:
    """Run tool agent; on transient API errors switch provider and retry."""
    while True:
        try:
            if not fb._backend:
                fb._initialize_backend()
            assert fb._backend is not None
            return run_tool_agent(
                fb._backend,
                user_prompt,
                system_prompt,
                execute_enabled=execute_enabled,
                auto_confirm=auto_confirm,
                read_only_mode=read_only_mode,
                max_rounds=max_rounds,
            )
        except APIError as e:
            if not is_failover_error(e):
                raise
            cur = fb.failover_manager.get_current_backend()
            fb.failover_manager.mark_failed(cur)
            nxt = fb.failover_manager.switch_to_backup()
            if not nxt:
                raise APIError(f"Tool agent failed: {e}") from e
            render_warning(
                f"Tool agent: switching provider ({cur} failed) → {nxt}. Retrying..."
            )
            fb._initialize_backend(use_initial_model=False)
