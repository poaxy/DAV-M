#!/usr/bin/env bash
set -euo pipefail

# DAV-M installer
# Usage: curl -fsSL https://raw.githubusercontent.com/poaxy/DAV-M/main/install.sh | bash

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

info()    { printf "  ${CYAN}→${RESET} %s\n" "$*"; }
success() { printf "  ${GREEN}✓${RESET} %s\n" "$*"; }
error()   { printf "  ${RED}✗${RESET} %s\n" "$*" >&2; }
bold()    { printf "${BOLD}%s${RESET}\n" "$*"; }

printf "\n"
bold "DAV-M — Terminal AI Assistant"
printf "${DIM}  https://github.com/poaxy/DAV-M${RESET}\n\n"

# ── 1. Check Node.js ──────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  printf "\n  Install it from ${BOLD}https://nodejs.org${RESET} (v20 or later), then re-run this script.\n\n"
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js v${NODE_VERSION} found — v20 or later is required."
  printf "\n  Upgrade at ${BOLD}https://nodejs.org${RESET}\n\n"
  exit 1
fi

success "Node.js v$(node --version | tr -d v) detected"

# ── 2. Install dav-ai ─────────────────────────────────────────────────────────

info "Installing dav-ai..."
npm install -g dav-ai --silent
success "dav-ai installed"

# ── 3. Run setup wizard ───────────────────────────────────────────────────────

printf "\n"
dav --setup
