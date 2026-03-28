# Phase 5 enterprise pilot: runbook and SIEM samples

This document supports **stakeholder-defined pilot exit criteria** for roadmap **Phase 5** (enterprise control plane): policy provenance, approvals, compliance export, and license behavior. See the phased roadmap in the repository (`local/plans/10-phased-roadmap.md` when present in a full checkout).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DAV_POLICY_BUNDLE_PATH` | Org policy JSON file (overrides `~/.dav/org/policy.json`). |
| `DAV_CONTROL_PLANE_URL` | Optional HTTPS base URL for remote policy / license / usage. |
| `DAV_CONTROL_PLANE_TOKEN` | Bearer token for control plane HTTP. |
| `DAV_APPROVAL_ROLES_PATH` | Role map JSON (default `~/.dav/org/approval_roles.json`). |
| `DAV_LICENSE_STATE` | `valid`, `grace`, `expired`, `invalid` (no-op client testing). |
| `DAV_LICENSE_ENFORCEMENT` | `grace` (default), `read_only` (block mutating tools when license bad), `block`. |
| `DAV_AUDIT_LOG_DIR` | Directory containing `dav_audit.jsonl`. |
| `DAV_AUDIT_MAX_BYTES` | Rotate audit file when size exceeds this (default 50MB). |
| `DAV_USAGE_REPORTING` | Set `0` to disable flushing usage to control plane on exit. |
| `DAV_PRODUCT_ANALYTICS` | `1` / `true` to append opt-in analytics to `dav_product_analytics.jsonl` (separate from audit). |

## Org policy bundle (example)

Place at `~/.dav/org/policy.json` or point `DAV_POLICY_BUNDLE_PATH` at a file:

```json
{
  "schema_version": 1,
  "version": "2026.03.28.1",
  "org_id": "org_example",
  "rules": {
    "deny_actions": [
      {
        "action": "exec.shell",
        "resource_glob": "/prod/**",
        "reason": "Production paths require a separate workflow"
      }
    ],
    "require_approval_role": {
      "exec.shell": "admin",
      "mcp.call": "admin"
    }
  }
}
```

## Approval roles (example)

`~/.dav/org/approval_roles.json`:

```json
{
  "roles": {
    "admin": ["alice", "bob"]
  }
}
```

If this file is **missing**, interactive approval behaves as before (any logged-in user may confirm). If present, only listed OS usernames may approve when a role is required.

## Export audit records

```bash
dav audit export --since 2026-01-01T00:00:00Z --types policy.decision,approval.resolved -o evidence.jsonl
dav audit export --cef --output /var/log/dav/cef.log
```

Forward `evidence.jsonl` or CEF to your SIEM (syslog/TLS, Azure AMA, Splunk HF, etc.).

## Sample SIEM / KQL-style filters

After ingesting NDJSON with fields `type`, `action`, `outcome`, `ts`, `actor`:

- **High-risk denials:** `type == "policy.decision" && outcome == "DENY"`
- **MCP usage:** `type == "mcp.tool.invoke"`
- **Approval trail:** `type == "approval.requested" || type == "approval.resolved"`
- **Policy bundle applied:** `type == "policy.bundle.applied"`

## Pilot checklist (fill in with stakeholders)

- [ ] RACI for production-impacting actions (who may approve under `admin` or equivalent).
- [ ] Retention period for audit files on disk vs. forwarded to SIEM.
- [ ] License enforcement mode (`grace` vs `read_only` vs `block`) for expired seats.
- [ ] Evidence export window and sampling method for auditor review.
