#!/usr/bin/env python3
"""Verify signed plugin manifests against trusted PEM public keys (CI)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser(description="Verify plugin manifest Ed25519 signature")
    p.add_argument("manifest", type=Path, help="Path to manifest JSON")
    p.add_argument(
        "public_keys",
        nargs="+",
        type=Path,
        help="PEM public key file(s)",
    )
    args = p.parse_args()
    from dav.plugins.signing import verify_manifest_file

    ok = verify_manifest_file(args.manifest, list(args.public_keys))
    if not ok:
        print("VERIFICATION FAILED", file=sys.stderr)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
