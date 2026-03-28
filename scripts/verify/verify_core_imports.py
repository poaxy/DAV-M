#!/usr/bin/env python3
"""Fail if dav core imports optional packs at module import time (beyond allowed entry)."""

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DAV = ROOT / "dav"
FORBIDDEN = ("dav_security", "dav_automation")


def imports_forbidden(tree: ast.Module) -> bool:
    """Only module-level imports (not inside functions)."""
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in FORBIDDEN:
                    return True
        if isinstance(node, ast.ImportFrom):
            if node.module and node.module.split(".")[0] in FORBIDDEN:
                return True
    return False


def main() -> int:
    bad = []
    for path in sorted(DAV.rglob("*.py")):
        if "vulnerability" in str(path):
            continue
        rel = path.relative_to(ROOT)
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as e:
            print(f"Syntax error in {rel}: {e}", file=sys.stderr)
            return 2
        if imports_forbidden(tree):
            bad.append(str(rel))
    if bad:
        print("Core dav/ must not import dav_security or dav_automation at top level:", file=sys.stderr)
        for b in bad:
            print(f"  {b}", file=sys.stderr)
        return 1
    print("OK: no forbidden top-level imports in dav/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
