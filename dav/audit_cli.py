"""`dav audit` subcommands."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

audit_app = typer.Typer(help="Audit trail export and compliance")


@audit_app.command("export")
def audit_export(
    since: Optional[str] = typer.Option(
        None,
        "--since",
        help="ISO8601 start time inclusive (e.g. 2026-01-01T00:00:00Z)",
    ),
    until: Optional[str] = typer.Option(
        None,
        "--until",
        help="ISO8601 end time inclusive",
    ),
    types: Optional[str] = typer.Option(
        None,
        "--types",
        help="Comma-separated event types (e.g. policy.decision,approval.resolved)",
    ),
    output: Optional[Path] = typer.Option(
        None,
        "-o",
        "--output",
        help="Write to file instead of stdout",
    ),
    cef: bool = typer.Option(
        False,
        "--cef",
        help="Emit CEF lines instead of JSON (for SIEM forwarders)",
    ),
    audit_file: Optional[Path] = typer.Option(
        None,
        "--audit-file",
        help="Override audit JSONL path (default: ~/.dav/logs/dav_audit.jsonl or DAV_AUDIT_LOG_DIR)",
    ),
) -> None:
    """Export filtered audit records as NDJSON or CEF."""
    from dav.observability.export import run_audit_export

    run_audit_export(
        since=since,
        until=until,
        types=types,
        output=output,
        cef=cef,
        audit_path=audit_file,
    )
