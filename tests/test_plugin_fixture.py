"""Signed plugin manifest fixture."""

import base64
from pathlib import Path

import pytest

pytest.importorskip("cryptography")

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from dav.plugins.signing import canonical_manifest_bytes, verify_manifest_bytes, verify_manifest_file


def test_ed25519_sign_verify_roundtrip():
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    body = {"manifest_version": 1, "name": "t", "version": "1.0.0", "tools": []}
    sig = priv.sign(canonical_manifest_bytes(body))
    manifest = {**body, "signature": base64.b64encode(sig).decode()}
    assert verify_manifest_bytes(manifest, pub)


def test_fixture_manifest_verifies():
    root = Path(__file__).resolve().parent / "fixtures" / "plugin"
    man = root / "signed_manifest.json"
    key = root / "trusted_public.pem"
    assert man.is_file() and key.is_file()
    assert verify_manifest_file(man, [key])
