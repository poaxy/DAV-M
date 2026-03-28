"""Interactive trust onboarding (doc 08 §3)."""

from __future__ import annotations

from pathlib import Path

from rich.panel import Panel
from rich.prompt import Prompt

from dav.terminal import console
from dav.trust_profile import (
    detect_git_root,
    has_trust_ack,
    save_trust_profile,
    trust_ack_path,
)


def run_interactive_trust_onboarding() -> None:
    """Detect git root, suggest mode, write trust_profile.json, create .trust_ack."""
    console.print(
        Panel.fit(
            "[bold]Trust onboarding[/bold]\n"
            "We will optionally record a trusted workspace root and preferred mode.",
            border_style="cyan",
        )
    )
    root = detect_git_root()
    if root:
        console.print(f"[green]Git repository root:[/green] {root}")
    else:
        console.print("[yellow]No git repository detected in the current directory.[/yellow]")

    roots: list[str] = []
    if root:
        add = Prompt.ask("Trust this folder for workspace-scoped defaults?", choices=["y", "n"], default="y")
        if add.lower() == "y":
            roots.append(str(root))

    mode = Prompt.ask(
        "Suggested default posture",
        choices=["ask", "workspace"],
        default="workspace",
    )
    save_trust_profile(trusted_roots=roots, default_mode=mode)
    console.print(f"[green]Wrote[/green] {Path.home() / '.dav' / 'trust_profile.json'}")

    trust_ack_path().parent.mkdir(parents=True, exist_ok=True)
    trust_ack_path().write_text("ok\n", encoding="utf-8")
    console.print(
        "\n[dim]Data flows and API usage: see docs/trust-and-data.md in the repository.[/dim]\n"
    )


def maybe_prompt_first_run_onboarding() -> None:
    """If no trust ack, offer one-line hint (non-blocking)."""
    if has_trust_ack():
        return
    console.print(
        "[dim]Tip: run [cyan]dav --trust-onboarding[/cyan] to record trusted roots and mode.[/dim]\n"
    )
