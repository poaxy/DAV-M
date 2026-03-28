"""Configuration management for Dav."""

import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

env_paths = [
    Path.home() / ".dav" / ".env",
    Path.cwd() / ".env",
]
for env_path in env_paths:
    if env_path.exists():
        try:
            from dav.file_security import check_and_warn_permissions
            check_and_warn_permissions(env_path, "Configuration file")
        except Exception:
            pass
        
        try:
            if env_path.stat().st_size > 0:
                load_dotenv(env_path)
        except Exception:
            load_dotenv(env_path)
        break

DEFAULT_MODEL_OPENAI = "o4-mini"
DEFAULT_MODEL_ANTHROPIC = "claude-sonnet-4-6"
DEFAULT_MODEL_GEMINI = "gemini-2.5-pro"
DEFAULT_BACKEND = "openai"
DEFAULT_MAX_STDIN_CHARS = 32000
DEFAULT_MAX_CONTEXT_TOKENS = 80000
DEFAULT_MAX_CONTEXT_MESSAGES = 100
def get_api_key(backend: str) -> Optional[str]:
    """Get API key for the specified backend."""
    if backend == "openai":
        return os.getenv("OPENAI_API_KEY")
    elif backend == "anthropic":
        return os.getenv("ANTHROPIC_API_KEY")
    elif backend == "gemini":
        return os.getenv("GEMINI_API_KEY")
    return None

def get_default_model(backend: str) -> str:
    """Get default model for the specified backend."""
    model = os.getenv("DAV_DEFAULT_MODEL")
    if model:
        return model
    
    if backend == "openai":
        return os.getenv("DAV_OPENAI_MODEL", DEFAULT_MODEL_OPENAI)
    elif backend == "anthropic":
        return os.getenv("DAV_ANTHROPIC_MODEL", DEFAULT_MODEL_ANTHROPIC)
    elif backend == "gemini":
        return os.getenv("DAV_GEMINI_MODEL", DEFAULT_MODEL_GEMINI)
    
    return DEFAULT_MODEL_OPENAI

def get_default_backend() -> str:
    """Get default AI backend."""
    return os.getenv("DAV_BACKEND", DEFAULT_BACKEND)

def get_execute_permission() -> bool:
    """Check if command execution is enabled."""
    return os.getenv("DAV_ALLOW_EXECUTE", "false").lower() == "true"

def get_session_dir() -> Path:
    """Get directory for session files."""
    session_dir = os.getenv("DAV_SESSION_DIR")
    if session_dir:
        return Path(session_dir).expanduser()
    return Path.home() / ".dav" / "sessions"


def get_max_stdin_chars() -> int:
    """Get maximum number of stdin characters to capture."""
    value = os.getenv("DAV_MAX_STDIN_CHARS")
    if value:
        try:
            parsed = int(value)
            if parsed <= 0:
                return DEFAULT_MAX_STDIN_CHARS
            return min(parsed, 1_000_000)
        except ValueError:
            return DEFAULT_MAX_STDIN_CHARS
    return DEFAULT_MAX_STDIN_CHARS


def get_max_context_tokens() -> int:
    """Get maximum tokens for context window."""
    value = os.getenv("DAV_MAX_CONTEXT_TOKENS")
    if value:
        try:
            parsed = int(value)
            if parsed <= 0:
                return DEFAULT_MAX_CONTEXT_TOKENS
            return min(parsed, 200_000)
        except ValueError:
            return DEFAULT_MAX_CONTEXT_TOKENS
    return DEFAULT_MAX_CONTEXT_TOKENS


def get_max_context_messages() -> int:
    """Get maximum messages to include in context."""
    value = os.getenv("DAV_MAX_CONTEXT_MESSAGES")
    if value:
        try:
            parsed = int(value)
            if parsed <= 0:
                return DEFAULT_MAX_CONTEXT_MESSAGES
            return min(parsed, 500)
        except ValueError:
            return DEFAULT_MAX_CONTEXT_MESSAGES
    return DEFAULT_MAX_CONTEXT_MESSAGES


def get_automation_sudo_method() -> str:
    """Get automation sudo method preference."""
    return os.getenv("DAV_AUTOMATION_SUDO_METHOD", "sudoers").lower()


def get_automation_log_dir() -> Path:
    """Get directory for automation logs."""
    log_dir = os.getenv("DAV_AUTOMATION_LOG_DIR")
    if log_dir:
        return Path(log_dir).expanduser()
    return Path.home() / ".dav" / "logs"


def get_automation_log_retention_days() -> int:
    """Get number of days to retain automation logs."""
    value = os.getenv("DAV_AUTOMATION_LOG_RETENTION_DAYS")
    if value:
        try:
            parsed = int(value)
            if parsed <= 0:
                return 30
            return min(parsed, 365)
        except ValueError:
            return 30
    return 30


def get_scripts_dir() -> Path:
    """Get directory for user-created automation scripts.

    Scripts are stored under the user's .dav directory by default, but can be
    overridden via DAV_SCRIPTS_DIR.
    """
    scripts_dir = os.getenv("DAV_SCRIPTS_DIR")
    if scripts_dir:
        return Path(scripts_dir).expanduser()
    return Path.home() / ".dav" / "scripts"


def is_provider_configured(backend: str) -> bool:
    """Check if a provider has an API key configured."""
    api_key = get_api_key(backend)
    if api_key:
        return True
    
    # Special case for Gemini - check GOOGLE_API_KEY
    if backend == "gemini":
        return os.getenv("GOOGLE_API_KEY") is not None
    
    return False


def get_available_providers() -> List[str]:
    """Get list of configured providers."""
    available = []
    priority_order = get_provider_priority()
    
    for backend in priority_order:
        if is_provider_configured(backend):
            available.append(backend)
    
    return available


def get_provider_priority() -> List[str]:
    """Get provider priority order."""
    # Default priority: OpenAI > Anthropic > Gemini
    return ["openai", "anthropic", "gemini"]


def get_nvd_api_key() -> Optional[str]:
    """Get NVD API key from environment."""
    return os.getenv("DAV_NVD_API_KEY") or os.getenv("NVD_API_KEY")


def get_cve_cache_dir() -> Path:
    """Get directory for CVE cache files."""
    cache_dir = os.getenv("DAV_CVE_CACHE_DIR")
    if cache_dir:
        return Path(cache_dir).expanduser()
    return Path.home() / ".dav" / "cve_cache"


def get_cve_cache_ttl() -> int:
    """Get CVE cache TTL in seconds (default: 24 hours)."""
    try:
        return int(os.getenv("DAV_CVE_CACHE_TTL", "86400"))
    except ValueError:
        return 86400


def get_tool_calling_enabled() -> bool:
    """When True, use native LLM tool calling for execute mode (Phase 1). Default: on."""
    return os.getenv("DAV_TOOL_CALLING", "true").lower() not in ("0", "false", "no", "off")


def get_legacy_exec_marker_enabled() -> bool:
    """Allow >>>EXEC<<< text parsing as fallback alongside tool calling."""
    return os.getenv("DAV_LEGACY_EXEC_MARKER", "true").lower() not in ("0", "false", "no", "off")


def security_pack_enabled() -> bool:
    """CVE / vulnerability features (optional install extra)."""
    return os.getenv("DAV_DISABLE_SECURITY_PACK", "").lower() not in ("1", "true", "yes")


def automation_pack_enabled() -> bool:
    """Script generation / listing (optional install extra)."""
    return os.getenv("DAV_DISABLE_AUTOMATION_PACK", "").lower() not in ("1", "true", "yes")


def get_sandbox_mode() -> str:
    """Sandbox: auto (use bwrap when available), on (strict), off."""
    return os.getenv("DAV_SANDBOX", "auto").lower().strip()


def get_workspace_roots() -> List[str]:
    """Comma-separated extra roots to bind into the sandbox (default: cwd)."""
    raw = os.getenv("DAV_WORKSPACE_ROOT", "").strip()
    if not raw:
        try:
            return [os.getcwd()]
        except Exception:
            return [str(Path.home())]
    return [p.strip() for p in raw.split(",") if p.strip()]


def use_daemon() -> bool:
    """Route execution through davd when True and socket available."""
    return os.getenv("DAV_USE_DAEMON", "").lower() in ("1", "true", "yes")


def get_daemon_socket_path() -> Path:
    p = os.getenv("DAV_SOCKET_PATH", "").strip()
    if p:
        return Path(p).expanduser()
    return Path.home() / ".dav" / "davd.sock"


def sandbox_strict_mode() -> bool:
    """If True and DAV_SANDBOX=on but bwrap missing, fail closed for sandboxed runs."""
    return os.getenv("DAV_SANDBOX_STRICT", "").lower() in ("1", "true", "yes")


def index_enabled() -> bool:
    """Phase 3: workspace FTS index for retrieval-augmented prompts."""
    return os.getenv("DAV_INDEX_ENABLED", "").lower() in ("1", "true", "yes")


def get_index_root() -> Path:
    raw = os.getenv("DAV_INDEX_ROOT", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    try:
        return Path(os.getcwd()).resolve()
    except Exception:
        return Path.home()


def get_index_data_dir() -> Path:
    p = os.getenv("DAV_INDEX_DATA_DIR", "").strip()
    if p:
        return Path(p).expanduser().resolve()
    return Path.home() / ".dav" / "index"


def get_index_max_file_bytes() -> int:
    try:
        v = int(os.getenv("DAV_INDEX_MAX_FILE_BYTES", str(512 * 1024)))
        return max(1024, min(v, 8 * 1024 * 1024))
    except ValueError:
        return 512 * 1024


def get_index_context_max_chars() -> int:
    try:
        v = int(os.getenv("DAV_INDEX_CONTEXT_MAX_CHARS", "12000"))
        return max(1000, min(v, 100_000))
    except ValueError:
        return 12000


def routing_enabled() -> bool:
    return os.getenv("DAV_ROUTING_ENABLED", "").lower() in ("1", "true", "yes")


def get_routing_config_path() -> Path:
    p = os.getenv("DAV_ROUTING_CONFIG", "").strip()
    if p:
        return Path(p).expanduser()
    return Path.home() / ".dav" / "model_routing.json"


def mcp_tools_enabled() -> bool:
    """Expose mcp_invoke to the model when True (still requires trust registry entry to run)."""
    return os.getenv("DAV_MCP_ENABLED", "").lower() in ("1", "true", "yes")


def get_mcp_trust_config_path() -> Path:
    p = os.getenv("DAV_MCP_TRUST_CONFIG", "").strip()
    if p:
        return Path(p).expanduser()
    return Path.home() / ".dav" / "mcp_trust.json"


def get_mcp_catalog_path() -> Path:
    p = os.getenv("DAV_MCP_CATALOG_PATH", "").strip()
    if p:
        return Path(p).expanduser()
    return Path.home() / ".dav" / "mcp_catalog.json"


def mcp_catalog_enforced() -> bool:
    """If True, MCP servers must appear in catalog approved_servers."""
    return os.getenv("DAV_MCP_CATALOG_ENFORCE", "").lower() in ("1", "true", "yes")

