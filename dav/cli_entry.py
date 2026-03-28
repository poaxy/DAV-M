"""Console entry: `dav audit` must bypass the root Typer optional QUERY positional."""

from __future__ import annotations

import sys


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "audit":
        from dav.audit_cli import audit_app

        sys.argv = [sys.argv[0]] + sys.argv[2:]
        audit_app()
    else:
        from dav.cli import app

        app()
