"""Optional Rich status panel fields (doc 08): mode, policy, sandbox, network."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class StatusPanelExtras:
    """Second-row summary for interactive status panel."""

    execute_enabled: bool = False
    log_mode: bool = False
    session_id: Optional[str] = None
    policy_bundle_version: Optional[str] = None


def format_status_extras_line(extras: StatusPanelExtras) -> str:
    from dav.config import (
        get_daemon_socket_path,
        get_sandbox_mode,
        use_daemon,
    )
    from dav.network_policy import load_network_policy

    parts: list[str] = []
    if extras.log_mode:
        parts.append("context=log_analysis")
    else:
        parts.append(f"exec={'on' if extras.execute_enabled else 'off'}")

    parts.append(f"sandbox={get_sandbox_mode()}")
    eg = str(load_network_policy().get("egress") or "off")
    parts.append(f"net={eg}")

    if use_daemon():
        sock = get_daemon_socket_path()
        parts.append(f"davd=on({sock.name})")
    else:
        parts.append("davd=off")

    if extras.session_id:
        sid = extras.session_id[:40] + ("…" if len(extras.session_id) > 40 else "")
        parts.append(f"session={sid}")

    if extras.policy_bundle_version:
        parts.append(f"policy={extras.policy_bundle_version[:32]}")

    return "[dim]" + " | ".join(parts) + "[/dim]"
