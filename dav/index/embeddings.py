"""Pluggable embedding backends for semantic retrieval (optional, Phase 3)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Sequence


class EmbeddingBackend(ABC):
    """Optional vector backend; default index uses FTS5 only."""

    @abstractmethod
    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        """Return one vector per input text (same length)."""


class NoopEmbeddingBackend(EmbeddingBackend):
    """Placeholder when embeddings are disabled."""

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        return [[0.0] for _ in texts]
