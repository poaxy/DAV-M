# DAV MAX (Dav-M)

**DAV MAX** is a terminal AI assistant for **Linux and macOS**. It runs as the `dav` command: you ask in plain language, it uses your machine context (directory, OS, optional stdin), and it can run shell commands **only when you confirm**—so you stay in control.

Repository: [github.com/poaxy/DAV](https://github.com/poaxy/DAV) · Python package name: `dav-ai`

---

## Install

**Requirements:** Python 3.8+, an API key from [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Google Gemini](https://ai.google.dev/).

**Install (pick one):**

```bash
pipx install git+https://github.com/poaxy/DAV.git
```

```bash
pip install --user git+https://github.com/poaxy/DAV.git
```

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install git+https://github.com/poaxy/DAV.git
```

**First run** — creates `~/.dav/` and walks through API keys:

```bash
dav --setup
```

Check:

```bash
dav --version
```

---

## Use cases

| Use case | Example |
|----------|---------|
| Ask how to do something (no commands run) | `dav "how do I list open ports?"` |
| Run suggested commands with confirmation | `dav "show disk usage of /home" --execute` |
| Interactive session | `dav -i` |
| Pipe logs for analysis | `cat /var/log/syslog \| dav -log "summarize errors"` |

For privacy, audit logs, and optional enterprise settings, see **[docs/trust-and-data.md](docs/trust-and-data.md)** and **[docs/README.md](docs/README.md)**.

---

## License

MIT.
