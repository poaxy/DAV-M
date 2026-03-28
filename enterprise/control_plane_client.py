"""Abstract control plane: policy fetch, usage reporting, license checks."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional, Protocol


class LicenseState(str, Enum):
    """License / entitlement status returned by the control plane."""

    VALID = "valid"
    GRACE = "grace"
    EXPIRED = "expired"
    INVALID = "invalid"
    UNKNOWN = "unknown"


@dataclass
class UsageReport:
    """Aggregated usage (no PII by default)."""

    session_count: int = 0
    tool_invocation_count: int = 0
    extra: Dict[str, Any] = field(default_factory=dict)


class ControlPlaneClient(Protocol):
    """Contract for org policy, licensing, and usage (see local/plans/08)."""

    def fetch_policy(self) -> bytes:
        """Return raw policy bundle JSON bytes (UTF-8)."""

    def report_usage(self, report: UsageReport) -> None:
        """Send aggregated usage; must not raise into user-facing paths."""

    def check_license(self) -> LicenseState:
        """Return current license state."""


class NoOpControlPlaneClient:
    """Local installs: no remote calls; optional env overrides for testing."""

    def fetch_policy(self) -> bytes:
        path = os.getenv("DAV_POLICY_BUNDLE_PATH")
        if path:
            p = Path(path).expanduser()
            if p.is_file():
                return p.read_bytes()
        default = Path.home() / ".dav" / "org" / "policy.json"
        if default.is_file():
            return default.read_bytes()
        return b"{}"

    def report_usage(self, report: UsageReport) -> None:
        if os.getenv("DAV_USAGE_LOG_PATH"):
            try:
                line = json.dumps(
                    {
                        "session_count": report.session_count,
                        "tool_invocation_count": report.tool_invocation_count,
                        **report.extra,
                    }
                )
                Path(os.environ["DAV_USAGE_LOG_PATH"]).expanduser().parent.mkdir(
                    parents=True, exist_ok=True
                )
                with open(
                    os.path.expanduser(os.environ["DAV_USAGE_LOG_PATH"]),
                    "a",
                    encoding="utf-8",
                ) as f:
                    f.write(line + "\n")
            except Exception:
                pass

    def check_license(self) -> LicenseState:
        raw = os.getenv("DAV_LICENSE_STATE", "").strip().lower()
        if raw in ("valid", "grace", "expired", "invalid"):
            return LicenseState(raw)
        return LicenseState.VALID


class HttpControlPlaneClient:
    """Optional HTTP control plane (Bearer token, ETag cache)."""

    def __init__(
        self,
        base_url: str,
        token: Optional[str] = None,
        cache_path: Optional[Path] = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._cache = cache_path or (Path.home() / ".dav" / "org" / "policy.cache.json")

    def fetch_policy(self) -> bytes:
        url = f"{self._base}/v1/policy/bundle"
        req = urllib.request.Request(url, method="GET")
        if self._token:
            req.add_header("Authorization", f"Bearer {self._token}")
        etag_path = self._cache.with_suffix(self._cache.suffix + ".etag")
        if etag_path.is_file():
            try:
                req.add_header("If-None-Match", etag_path.read_text().strip())
            except Exception:
                pass
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                et = resp.headers.get("ETag")
                if et:
                    try:
                        self._cache.parent.mkdir(parents=True, exist_ok=True)
                        etag_path.write_text(et, encoding="utf-8")
                        self._cache.write_bytes(body)
                    except Exception:
                        pass
                return body
        except urllib.error.HTTPError as e:
            if e.code == 304 and self._cache.is_file():
                return self._cache.read_bytes()
            return _fallback_local_policy_bytes()
        except Exception:
            return _fallback_local_policy_bytes()

    def report_usage(self, report: UsageReport) -> None:
        url = f"{self._base}/v1/usage"
        payload = json.dumps(
            {
                "session_count": report.session_count,
                "tool_invocation_count": report.tool_invocation_count,
                **report.extra,
            }
        ).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        if self._token:
            req.add_header("Authorization", f"Bearer {self._token}")
        try:
            urllib.request.urlopen(req, timeout=15)
        except Exception:
            pass

    def check_license(self) -> LicenseState:
        url = f"{self._base}/v1/license"
        req = urllib.request.Request(url, method="GET")
        if self._token:
            req.add_header("Authorization", f"Bearer {self._token}")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                st = str(data.get("state", "valid")).lower()
                if st in ("valid", "grace", "expired", "invalid"):
                    return LicenseState(st)
        except Exception:
            pass
        return LicenseState.UNKNOWN


def _fallback_local_policy_bytes() -> bytes:
    path = os.getenv("DAV_POLICY_BUNDLE_PATH")
    if path:
        p = Path(path).expanduser()
        if p.is_file():
            return p.read_bytes()
    default = Path.home() / ".dav" / "org" / "policy.json"
    if default.is_file():
        return default.read_bytes()
    return b"{}"


def build_control_plane_client() -> ControlPlaneClient:
    """Env: DAV_CONTROL_PLANE_URL, DAV_CONTROL_PLANE_TOKEN (optional)."""
    base = os.getenv("DAV_CONTROL_PLANE_URL", "").strip()
    if base:
        tok = os.getenv("DAV_CONTROL_PLANE_TOKEN", "").strip() or None
        return HttpControlPlaneClient(base, token=tok)
    return NoOpControlPlaneClient()


def fetch_policy_bundle_bytes(client: Optional[ControlPlaneClient] = None) -> bytes:
    """Fetch policy bytes via active client (cached call sites can pass client)."""
    c = client or build_control_plane_client()
    return c.fetch_policy()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
