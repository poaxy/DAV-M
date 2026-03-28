# Changelog

## Unreleased

### Added

- Doc 08 product UX / trust: **[docs/trust-and-data.md](docs/trust-and-data.md)** (data flows, API keys, audit), Rich **trust summary panels** after `dav --setup`, **enriched interactive status panel** (`dav/status_panel.py`: exec, sandbox, network, davd, session, policy version), **`--plan-first`** (plan text then tools), **`--trust-onboarding`** + **`~/.dav/trust_profile.json`**, **`confirm_action(..., risk_hint=)`** for shell/MCP prompts, **`scripts/verify/verify_enterprise_import.py`**, tests **`tests/test_doc08_ux.py`**.
- Phase 5 enterprise control plane: **`enterprise`** package (`ControlPlaneClient`, `NoOpControlPlaneClient`, optional HTTP + ETag cache), **`dav.policy.bundle`** (org JSON policy, deny rules, approval roles), **`dav.approval.routing`** (`~/.dav/org/approval_roles.json`), **`dav.license_gate`** + **`dav.usage_reporting`**, audit schema v2 (`schema_version`, `event_id`, `approval.*`, `policy.bundle.applied`, `license.state_change`, rotation via `DAV_AUDIT_MAX_BYTES`), **`dav audit export`** (NDJSON/CEF; use `dav` console script — `dav audit …` is routed via `dav.cli_entry` so Typer does not swallow `audit` as QUERY), optional **`DAV_PRODUCT_ANALYTICS`**, tests in `tests/test_phase5_enterprise.py`, runbook `docs/phase5-enterprise-runbook.md`.
- Phase 4 MCP and plugins: **`mcp_invoke`** tool (gated by `DAV_MCP_ENABLED`), **`dav.mcp`** trust registry (`mcp_trust.json`), optional **org catalog** (`mcp_catalog.json`, `DAV_MCP_CATALOG_ENFORCE`), **`MCP_CALL`** policy + **`log_mcp_call`** audit, stdio client via optional **`mcp`** extra (Python 3.10+), **`dav.plugins`** Ed25519 manifest verify + **`scripts/verify/verify_plugin_manifests.py`** / **`scripts/plugins/sign_plugin_manifest.py`**, CI verification of fixture manifest, extras **`[mcp]`** and **`[plugins]`**.
- Phase 3 retrieval and performance: workspace **FTS index** (`dav.index`, `DAV_INDEX_ENABLED`), debounced **watchdog** re-indexing, **retrieval-augmented** prompts in the CLI, **`read_workspace_file`** tool (READ policy, parallel-safe with other reads), **parallel** dispatch for multiple read-only tools in one turn, **model routing** config (`DAV_ROUTING_ENABLED`, `~/.dav/model_routing.json`), optional **embedding** protocol (`dav.index.embeddings`), `scripts/bench/bench_phase3.py`, and optional OTel-oriented helpers in `dav.observability.genai_attributes`.
- Phase 2 sandbox and optional daemon: `dav.sandbox` (bubblewrap on Linux, macOS passthrough), `davd` JSON-RPC over a Unix socket (`health.ping`, `exec.run`), CLI `--no-daemon` and `DAV_USE_DAEMON`, minimal `~/.dav/network_policy.json` egress (`off` vs `open`), audit hooks for sandbox events, `scripts/bench/bench_sandbox.py`, and Linux CI with bubblewrap.
- Phase 1 structured tool calling: native `exec_shell` tool with JSON Schema registry (`dav.tools`), multi-turn loops for OpenAI, Anthropic, and Gemini (`dav.agent`), and policy-gated execution (`dav.policy`).
- JSONL audit log at `~/.dav/logs/dav_audit.jsonl` (override with `DAV_AUDIT_LOG_DIR`).
- Central secret redaction (`dav.observability.redaction`) applied to legacy feedback loops and tool outputs where applicable.
- Optional install extras: `pip install 'dav-ai[security]'`, `pip install 'dav-ai[automation]'` (markers for packaging; same wheel includes `dav_security` and `dav_automation`).
- Deprecation warnings for `--cve`, `--script`, and legacy `>>>EXEC<<<` when tool calling is enabled.
- `scripts/verify/verify_core_imports.py` to ensure `dav/` does not import optional packs at module scope.
- Tests under `tests/` for tool registry and policy.

### Changed

- Repository layout: **`scripts/`** grouped into **`verify/`**, **`bench/`**, **`plugins/`**; added **`docs/README.md`**, **`scripts/README.md`**, and versioned **`docs/phase5-enterprise-runbook.md`**; **`.gitignore`** expanded for local tooling artifacts.
- CVE / vulnerability code moved to top-level package `dav_security/`; script helpers moved to `dav_automation/`.
- `execute_commands_from_response` and structured plans now route shell execution through `dispatch_tool_call` (policy + audit).

### Configuration

- Phase 5: `DAV_POLICY_BUNDLE_PATH`, `DAV_CONTROL_PLANE_URL`, `DAV_CONTROL_PLANE_TOKEN`, `DAV_APPROVAL_ROLES_PATH`, `DAV_LICENSE_STATE`, `DAV_LICENSE_ENFORCEMENT`, `DAV_AUDIT_MAX_BYTES`, `DAV_USAGE_REPORTING`, `DAV_PRODUCT_ANALYTICS` — see `docs/phase5-enterprise-runbook.md`.
- `DAV_MCP_ENABLED`, `DAV_MCP_TRUST_CONFIG`, `DAV_MCP_CATALOG_PATH`, `DAV_MCP_CATALOG_ENFORCE` — MCP gateway (Phase 4); see README.
- `DAV_INDEX_ENABLED`, `DAV_INDEX_ROOT`, `DAV_INDEX_DATA_DIR`, `DAV_INDEX_MAX_FILE_BYTES`, `DAV_INDEX_CONTEXT_MAX_CHARS` — workspace FTS index (Phase 3).
- `DAV_ROUTING_ENABLED`, `DAV_ROUTING_CONFIG` — model routing rules (Phase 3).
- `DAV_SANDBOX`, `DAV_SANDBOX_STRICT`, `DAV_WORKSPACE_ROOT`, `DAV_USE_DAEMON`, `DAV_SOCKET_PATH` — see README (Phase 2 sandbox / davd).
- `DAV_TOOL_CALLING` — default `true`; set to `false` for legacy streaming + `>>>EXEC<<<` only.
- `DAV_LEGACY_EXEC_MARKER` — default `true`; legacy marker path remains available when the model returns text instead of tools.
- `DAV_DISABLE_SECURITY_PACK` / `DAV_DISABLE_AUTOMATION_PACK` — set to `1` to disable those CLI paths (requires extras messaging).
