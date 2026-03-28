# Contributing to Dav

## Core vs optional packs

| Area | Package | Notes |
|------|---------|--------|
| Agent, CLI, policy, tools, executor | `dav` | Core; avoid importing `dav_security` or `dav_automation` at **module level** in `dav/` (lazy imports inside CLI handlers are fine). |
| CVE / NVD scanning | `dav_security` | Security Pack; optional extra `[security]`. |
| Script generation / listing | `dav_automation` | Automation Pack; optional extra `[automation]`. |

Run `python scripts/verify/verify_core_imports.py` before submitting changes that touch imports.

## Tests

```bash
python -m pytest tests/
```

## Phase 1 conventions

- Mutating shell execution should go through `dav.tools.dispatch.dispatch_tool_call` so policy and audit stay consistent.
- New tools: register JSON Schema in `dav.tools.registry`.
