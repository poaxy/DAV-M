"""Optional plan-first gate before mutating tools (doc 08)."""

from __future__ import annotations

from typing import Optional

from dav.terminal import console, confirm_action


def apply_plan_first_gate(
    ai_backend,
    full_prompt: str,
    system_prompt: Optional[str],
) -> Optional[str]:
    """
    Ask the model for a text-only plan, show it, then confirm before tools run.

    Returns augmented full_prompt, or None if user aborts.
    """
    from rich.markdown import Markdown

    addon = (
        "\n\nIn this turn, respond with a concise numbered plan only. "
        "Do not assume tools or shell commands have executed yet."
    )
    sp = (system_prompt or "") + addon
    console.print("[dim]Plan-first: generating plan (no tools yet)…[/dim]\n")
    try:
        plan_text = ai_backend.get_response(full_prompt, system_prompt=sp)
    except Exception as e:
        console.print(f"[red]Plan-first failed: {e}[/red]")
        return None

    console.print(Markdown(plan_text))
    console.print()
    if not confirm_action(
        "Proceed with tools and execution (subject to policy and confirmations)?",
        risk_hint="The next steps may run shell commands, MCP tools, or file reads per your settings.",
    ):
        return None
    return (
        full_prompt
        + "\n\n---\nApproved plan (follow unless the user corrects you):\n"
        + plan_text
    )
