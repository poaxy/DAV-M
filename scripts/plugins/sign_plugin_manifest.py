#!/usr/bin/env python3
"""Sign a plugin manifest (dev tool). Outputs JSON with signature field to stdout."""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path, help="Manifest JSON without signature")
    ap.add_argument("--private-key-pem", type=Path, required=True)
    args = ap.parse_args()
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        from dav.plugins.signing import canonical_manifest_bytes
    except ImportError:
        print("Install cryptography: pip install cryptography", file=sys.stderr)
        return 1
    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        print("Manifest must be a JSON object", file=sys.stderr)
        return 1
    body = {k: v for k, v in data.items() if k != "signature"}
    priv = serialization.load_pem_private_key(
        args.private_key_pem.read_bytes(),
        password=None,
    )
    if not isinstance(priv, Ed25519PrivateKey):
        print("Private key must be Ed25519 PEM", file=sys.stderr)
        return 1
    sig = priv.sign(canonical_manifest_bytes(body))
    out = {**body, "signature": base64.b64encode(sig).decode()}
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
