#!/usr/bin/env bash
set -euo pipefail

# DAV-M installer
# Usage: curl -fsSL https://raw.githubusercontent.com/poaxy/DAV-M/main/install.sh | bash

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

info()    { printf "  ${CYAN}→${RESET} %s\n" "$*"; }
success() { printf "  ${GREEN}✓${RESET} %s\n" "$*"; }
warn()    { printf "  ${YELLOW}!${RESET} %s\n" "$*"; }
error()   { printf "  ${RED}✗${RESET} %s\n" "$*" >&2; }
bold()    { printf "${BOLD}%s${RESET}\n" "$*"; }

printf "\n"
bold "DAV-M — Terminal AI Assistant"
printf "${DIM}  https://github.com/poaxy/DAV-M${RESET}\n\n"

# ── 1. Check Node.js ────────────────────────────────────────────────────────

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

# ── 2. Install dav-ai ────────────────────────────────────────────────────────

info "Installing dav-ai globally..."
if npm install -g dav-ai --silent 2>/dev/null; then
  success "dav-ai installed ($(npm list -g dav-ai --depth=0 2>/dev/null | grep dav-ai | awk '{print $2}'))"
else
  # Retry without --silent to show the real error
  npm install -g dav-ai
fi

# ── 3. Detect shell profile ───────────────────────────────────────────────────

detect_profile() {
  if [ -n "${BASH_VERSION:-}" ]; then
    if [ -f "$HOME/.bash_profile" ]; then echo "$HOME/.bash_profile"
    else echo "$HOME/.bashrc"; fi
  elif [ -n "${ZSH_VERSION:-}" ]; then
    echo "$HOME/.zshrc"
  elif [ -f "$HOME/.zshrc" ]; then
    echo "$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    echo "$HOME/.bashrc"
  else
    echo "$HOME/.profile"
  fi
}

PROFILE=$(detect_profile)

# ── 4. API key setup ──────────────────────────────────────────────────────────

printf "\n"
bold "API Key Setup"
printf "${DIM}  DAV-M supports Anthropic, OpenAI, and Google Gemini.${RESET}\n"
printf "${DIM}  You can add more keys later by editing %s${RESET}\n\n" "$PROFILE"

printf "  Choose your primary provider:\n\n"
printf "    ${BOLD}1)${RESET} Anthropic Claude  ${DIM}(recommended — claude-sonnet-4-5)${RESET}\n"
printf "    ${BOLD}2)${RESET} OpenAI             ${DIM}(gpt-4o)${RESET}\n"
printf "    ${BOLD}3)${RESET} Google Gemini      ${DIM}(gemini-2.0-flash)${RESET}\n"
printf "    ${BOLD}4)${RESET} Skip for now\n\n"

read -rp "  Enter choice [1-4]: " CHOICE

write_key() {
  local VAR="$1"
  local KEY="$2"
  local PROFILE="$3"

  # Remove any existing line for this var
  if grep -q "export ${VAR}=" "$PROFILE" 2>/dev/null; then
    # Use temp file to avoid in-place sed portability issues
    local TMP
    TMP=$(mktemp)
    grep -v "export ${VAR}=" "$PROFILE" > "$TMP"
    mv "$TMP" "$PROFILE"
  fi

  printf '\nexport %s="%s"\n' "$VAR" "$KEY" >> "$PROFILE"
  export "${VAR}=${KEY}"
  success "Saved ${VAR} to ${PROFILE}"
}

case "$CHOICE" in
  1)
    printf "\n  Get your key at ${BOLD}https://console.anthropic.com/${RESET}\n"
    read -rsp "  Paste ANTHROPIC_API_KEY: " API_KEY
    printf "\n"
    [ -n "$API_KEY" ] && write_key "ANTHROPIC_API_KEY" "$API_KEY" "$PROFILE"
    ;;
  2)
    printf "\n  Get your key at ${BOLD}https://platform.openai.com/api-keys${RESET}\n"
    read -rsp "  Paste OPENAI_API_KEY: " API_KEY
    printf "\n"
    [ -n "$API_KEY" ] && write_key "OPENAI_API_KEY" "$API_KEY" "$PROFILE"
    ;;
  3)
    printf "\n  Get your key at ${BOLD}https://ai.google.dev/${RESET}\n"
    read -rsp "  Paste GOOGLE_GENERATIVE_AI_API_KEY: " API_KEY
    printf "\n"
    [ -n "$API_KEY" ] && write_key "GOOGLE_GENERATIVE_AI_API_KEY" "$API_KEY" "$PROFILE"
    ;;
  4|*)
    warn "Skipped. Set an API key in ${PROFILE} before running dav."
    ;;
esac

# ── 5. Done ───────────────────────────────────────────────────────────────────

printf "\n"
bold "All done!"
printf "\n"
printf "  Reload your shell:\n\n"
printf "    ${BOLD}source %s${RESET}\n\n" "$PROFILE"
printf "  Then start DAV-M:\n\n"
printf "    ${BOLD}dav${RESET}\n\n"
