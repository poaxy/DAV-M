"""Doc 08: status panel extras, enterprise import, trust profile helpers."""

from __future__ import annotations

from dav.status_panel import StatusPanelExtras, format_status_extras_line
from dav.trust_profile import detect_git_root, trust_profile_path


def test_status_extras_line_contains_keywords(monkeypatch) -> None:
    monkeypatch.setenv("DAV_SANDBOX", "auto")
    monkeypatch.setenv("DAV_USE_DAEMON", "0")
    ex = StatusPanelExtras(
        execute_enabled=True,
        session_id="sess_1",
        policy_bundle_version="1.2.3",
    )
    line = format_status_extras_line(ex)
    assert "exec=on" in line
    assert "sandbox=auto" in line
    assert "sess_1" in line
    assert "policy=1.2.3" in line


def test_enterprise_control_plane_importable() -> None:
    from enterprise.control_plane_client import build_control_plane_client, LicenseState

    c = build_control_plane_client()
    assert c.check_license() in (
        LicenseState.VALID,
        LicenseState.UNKNOWN,
        LicenseState.GRACE,
    )
    assert isinstance(c.fetch_policy(), (bytes, bytearray))


def test_git_root_detection_runs() -> None:
    # May be None in CI without git; call must not raise
    r = detect_git_root()
    assert r is None or r.is_absolute()


def test_trust_profile_path() -> None:
    assert trust_profile_path().name == "trust_profile.json"
