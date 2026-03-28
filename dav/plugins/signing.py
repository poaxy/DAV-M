"""Ed25519 manifest signing and verification (cryptography)."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.hazmat.primitives.serialization import load_pem_public_key
except ImportError:  # pragma: no cover
    Ed25519PublicKey = None  # type: ignore[misc, assignment]
    load_pem_public_key = None  # type: ignore[misc, assignment]


def canonical_manifest_bytes(manifest_body: Dict[str, Any]) -> bytes:
    """Stable JSON for signing (no signature field)."""
    return json.dumps(manifest_body, sort_keys=True, separators=(",", ":")).encode("utf-8")


def verify_manifest_bytes(
    manifest: Dict[str, Any],
    public_key: Any,
) -> bool:
    """
    Verify base64 Ed25519 signature over canonical JSON of manifest without `signature`.
    public_key: Ed25519PublicKey or PEM bytes.
    """
    if Ed25519PublicKey is None:
        return False
    sig_b64 = manifest.get("signature")
    if not sig_b64 or not isinstance(sig_b64, str):
        return False
    try:
        sig = base64.b64decode(sig_b64, validate=True)
    except Exception:
        return False
    body = {k: v for k, v in manifest.items() if k != "signature"}
    msg = canonical_manifest_bytes(body)
    if isinstance(public_key, bytes):
        try:
            pk = load_pem_public_key(public_key)
        except Exception:
            return False
        if not isinstance(pk, Ed25519PublicKey):
            return False
    else:
        pk = public_key
    try:
        pk.verify(sig, msg)
        return True
    except Exception:
        return False


def load_public_keys_from_paths(paths: List[Path]) -> List[Any]:
    keys: List[Any] = []
    if load_pem_public_key is None:
        return keys
    for p in paths:
        if not p.is_file():
            continue
        try:
            k = load_pem_public_key(p.read_bytes())
            keys.append(k)
        except Exception:
            continue
    return keys


def verify_manifest_file(manifest_path: Path, public_key_paths: List[Path]) -> bool:
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    for pk_path in public_key_paths:
        if not pk_path.is_file():
            continue
        try:
            pem = pk_path.read_bytes()
            if verify_manifest_bytes(data, pem):
                return True
        except Exception:
            continue
    return False
