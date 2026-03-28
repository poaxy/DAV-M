#!/usr/bin/env python3
"""Smoke: enterprise package and control plane client import (doc 08 / Phase 5)."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    try:
        from enterprise.control_plane_client import build_control_plane_client, LicenseState

        c = build_control_plane_client()
        st = c.check_license()
        if not isinstance(st, LicenseState):
            print("check_license did not return LicenseState", file=sys.stderr)
            return 1
        raw = c.fetch_policy()
        if not isinstance(raw, (bytes, bytearray)):
            print("fetch_policy did not return bytes", file=sys.stderr)
            return 1
    except Exception as e:
        print(f"enterprise import failed: {e}", file=sys.stderr)
        return 1
    print("OK: enterprise.control_plane_client")
    return 0


if __name__ == "__main__":
    sys.exit(main())
