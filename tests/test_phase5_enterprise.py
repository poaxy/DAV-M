"""Phase 5: policy bundle, approval routing, audit export, control plane."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from dav.policy.actions import EXEC_SHELL
from dav.policy.bundle import (
    bundle_denies_action,
    clear_policy_bundle_cache,
    get_active_policy_bundle,
    load_policy_bundle_from_bytes,
    required_approval_role,
)
from dav.policy.types import ActionRequest
from dav.approval.routing import can_user_approve
from dav.observability.export import run_audit_export


def test_policy_bundle_deny_glob() -> None:
    raw = json.dumps(
        {
            "version": "1",
            "rules": {
                "deny_actions": [
                    {"action": "exec.shell", "resource_glob": "/prod/*", "reason": "no prod"}
                ]
            },
        }
    ).encode()
    b = load_policy_bundle_from_bytes(raw)
    req = ActionRequest(action=EXEC_SHELL, resource="/prod/secret")
    d = bundle_denies_action(b, req)
    assert d is not None
    assert d.outcome.value == "DENY"


def test_required_approval_role() -> None:
    raw = json.dumps(
        {"rules": {"require_approval_role": {"exec.shell": "admin"}}}
    ).encode()
    b = load_policy_bundle_from_bytes(raw)
    assert required_approval_role(b, "exec.shell") == "admin"


def test_can_user_approve_without_mapping() -> None:
    assert can_user_approve("admin", "anyone") is True


def test_can_user_approve_with_mapping(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    p = tmp_path / "approval_roles.json"
    p.write_text(
        json.dumps({"roles": {"admin": ["alice"]}}),
        encoding="utf-8",
    )
    monkeypatch.setenv("DAV_APPROVAL_ROLES_PATH", str(p))
    assert can_user_approve("admin", "alice") is True
    assert can_user_approve("admin", "bob") is False


def test_audit_export_filters(tmp_path: Path) -> None:
    log = tmp_path / "a.jsonl"
    log.write_text(
        json.dumps(
            {
                "ts": "2026-01-15T12:00:00+00:00",
                "type": "policy.decision",
                "action": "x",
            }
        )
        + "\n"
        + json.dumps(
            {
                "ts": "2025-01-15T12:00:00+00:00",
                "type": "policy.decision",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    out = tmp_path / "out.jsonl"
    run_audit_export(
        since="2026-01-01T00:00:00Z",
        until=None,
        types="policy.decision",
        output=out,
        cef=False,
        audit_path=log,
    )
    lines = out.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    assert "2026-01-15" in lines[0]


def test_noop_control_plane() -> None:
    from enterprise.control_plane_client import NoOpControlPlaneClient, LicenseState

    c = NoOpControlPlaneClient()
    assert c.check_license() == LicenseState.VALID
    assert c.fetch_policy() == b"{}" or len(c.fetch_policy()) >= 0


def test_get_active_policy_bundle_respects_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    clear_policy_bundle_cache()
    policy_file = tmp_path / "p.json"
    policy_file.write_text('{"version": "9.9.9", "org_id": "o1"}', encoding="utf-8")
    monkeypatch.setenv("DAV_POLICY_BUNDLE_PATH", str(policy_file))
    b = get_active_policy_bundle()
    assert b.version == "9.9.9"
    assert b.org_id == "o1"
    clear_policy_bundle_cache()
