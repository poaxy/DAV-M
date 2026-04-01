# DAV-M

**DAV-M** is a terminal AI assistant for **macOS and Linux**. Run it as `dav` — describe what you want in plain language and it executes tasks using your machine context with interactive confirmation before any file or shell operation.

Built with TypeScript, React/Ink, and the Vercel AI SDK. Supports Anthropic, OpenAI, and Google Gemini — plus any tool server via the Model Context Protocol (MCP).

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/poaxy/DAV-M/main/install.sh)
```

---

## Features

- **Interactive TUI** — full terminal UI powered by Ink/React with syntax-highlighted output
- **Multi-provider** — Anthropic Claude, OpenAI GPT, Google Gemini; switch with `--model`
- **Agentic tool use** — reads files, edits files, runs shell commands, searches the web
- **Diff preview** — shows a unified diff before any file edit or write
- **MCP support** — connect any MCP server via `.mcp.json` config
- **Audit logging** — JSONL logs of every tool call, rotated daily to `~/.local/share/dav/audit/`
- **Session history** — conversations are saved and resumable
- **`--json` mode** — NDJSON output for scripting and pipelines
- **`--no-color`** — plain text output for terminals that don't support color

---

## Requirements

- Node.js 20+
- An API key from at least one provider:
  - [Anthropic](https://console.anthropic.com/) — `ANTHROPIC_API_KEY`
  - [OpenAI](https://platform.openai.com/api-keys) — `OPENAI_API_KEY`
  - [Google Gemini](https://ai.google.dev/) — `GOOGLE_GENERATIVE_AI_API_KEY`

---

## Install

**One-liner (recommended):**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/poaxy/DAV-M/main/install.sh)
```

This checks your Node.js version, installs `dav-ai` globally, and walks you through saving your API key to your shell profile.

**Manual install:**

```bash
npm install -g dav-ai
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY
dav
```

---

## Usage

```
dav [options] [prompt]
```

| Option | Description |
|--------|-------------|
| `--model <model>` | Model to use (e.g. `claude-sonnet-4-5`, `gpt-4o`, `gemini-2.0-flash`) |
| `--no-color` | Disable color output |
| `--json` | NDJSON output mode for scripting |
| `--no-mcp` | Skip MCP server connections |
| `--version` | Print version |
| `--help` | Show help |

**Examples:**

```bash
# Interactive session
dav

# One-shot prompt
dav "summarize the git log from the last week"

# Pipe input
cat error.log | dav "what is causing these errors?"

# Use a specific model
dav --model gpt-4o "refactor this file to use async/await"

# JSON output for scripting
dav --json "list all TODO comments in this repo" | jq .
```

---

## MCP Servers

DAV-M supports the [Model Context Protocol](https://modelcontextprotocol.io). Add servers to `.mcp.json` in your project or `~/.config/dav/mcp.json` globally:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

---

## Uninstall

```bash
dav --uninstall        # removes ~/.dav/ (config, sessions, logs)
npm uninstall -g dav-ai  # removes the dav command
```

`dav --uninstall` will ask for confirmation before deleting anything.

---

## Audit Logs

Every tool call is logged to `~/.local/share/dav/audit/audit-YYYY-MM-DD.jsonl`. Logs older than 30 days are pruned automatically.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error |
| `2` | Cancelled by user |
| `3` | Usage error |
| `4` | Auth error (missing API key) |
| `5` | Timeout |
| `130` | Interrupted (Ctrl-C) |

---

## Repository

[github.com/poaxy/DAV-M](https://github.com/poaxy/DAV-M)

---

## License

MIT
