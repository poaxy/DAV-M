"""Workspace index and retrieval (Phase 3)."""

from dav.index.service import WorkspaceIndex, ensure_workspace_index, get_workspace_index
from dav.index.types import ChunkHit

__all__ = [
    "ChunkHit",
    "WorkspaceIndex",
    "ensure_workspace_index",
    "get_workspace_index",
]
