# Trust, privacy, and data flows

This document summarizes **what leaves your machine**, **what stays local**, and **how to reason about risk** when using Dav. It supports product transparency expectations (see also [OWASP LLM02 — sensitive information disclosure](https://genai.owasp.org/llmrisk/llm02/)) and does not replace your organization’s legal or compliance review.

## What is sent to AI providers

- **API requests** go to the provider you configure (OpenAI, Anthropic, or Google Gemini) using your **API key** from `~/.dav/.env` (or process environment).
- **Prompt content** typically includes: your question, **system context** (OS, paths, workspace summary), **conversation history** for the session, and **optional stdin** or log content when you pipe input or use `-log`.
- **Tool results** (command output, file reads, MCP results) may be sent back to the model on later turns when tool calling is enabled—**redaction** is applied to many paths before data is shown to the model or written to audit logs, but you should still treat prompts as sensitive.

Dav does **not** implement model training; whether a **provider** retains or trains on API data is governed by **that provider’s** terms and product settings. Check your provider’s data policy for your account type.

## What stays local

- **Configuration** under `~/.dav/` (including `.env`, sessions, optional MCP trust and network policy files).
- **Audit log** (default `~/.dav/logs/dav_audit.jsonl`, or directory from `DAV_AUDIT_LOG_DIR`) — structured events for policy and execution (see [phase5-enterprise-runbook.md](./phase5-enterprise-runbook.md) for enterprise-oriented options).
- **Workspace files** are not bulk-uploaded; only what you include in prompts or tool reads is exposed.

## Secrets and API keys

- Store API keys in `~/.dav/.env` with **restrictive file permissions** (Dav attempts to set secure permissions on creation).
- Avoid pasting secrets into prompts; they may appear in provider logs or session history depending on provider behavior.

## Execution, sandbox, and network

- **Shell and MCP** actions are gated by **policy** and optional **confirmation** prompts.
- **Sandbox** (`DAV_SANDBOX`) and **network policy** (`~/.dav/network_policy.json`) constrain subprocess behavior where configured.
- Optional **`davd`** routes execution through a local daemon when enabled.

## Enterprise / org policy (optional)

If you use **managed policy** or a **control plane** (`DAV_CONTROL_PLANE_URL`, `DAV_POLICY_BUNDLE_PATH`, etc.), additional rules and audit expectations apply. See [phase5-enterprise-runbook.md](./phase5-enterprise-runbook.md).

## Further reading

- [README.md](../README.md) — configuration and security overview
- [phase5-enterprise-runbook.md](./phase5-enterprise-runbook.md) — audit export, SIEM-oriented usage, env vars
