"""Stable action identifiers for policy evaluation."""

# Filesystem
READ_FS = "read.fs"
WRITE_FS = "write.fs"

# Execution
EXEC_SHELL = "exec.shell"

# Network / integrations
NETWORK_HTTP = "network.http"
GIT_MUTATE = "git.mutate"
MCP_CALL = "mcp.call"
SECRET_READ = "secret.read"

ALL_ACTIONS = frozenset(
    {
        READ_FS,
        WRITE_FS,
        EXEC_SHELL,
        NETWORK_HTTP,
        GIT_MUTATE,
        MCP_CALL,
        SECRET_READ,
    }
)
