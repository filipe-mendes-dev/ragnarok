"""Chunk settings and embedding validation, independent of the provider."""

from math import isfinite
from typing import Protocol

from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk, chunk_text

MODEL_NAME = "openai/text-embedding-3-small"
RESPONSE_MODEL_NAME = "text-embedding-3-small"
# This identifies our configuration, not a pinned upstream model snapshot.
MODEL_REVISION = "openrouter-1536-v1"
EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 16

# Tune these two values for ingestion. Both are Unicode character counts.
CHUNKING_SETTINGS = ChunkingSettings(chunk_size=1_000, chunk_overlap=150)


class EmbeddingInputError(ValueError):
    """Rejected document input with a safe message for document status."""


class DocumentEmbedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


def chunk_for_embedding(text: str) -> list[TextChunk]:
    chunks = chunk_text(text, CHUNKING_SETTINGS)
    for chunk in chunks:
        validate_embedding_input(chunk.text)
    return chunks


def validate_embedding_input(text: str) -> None:
    if not text.strip():
        raise EmbeddingInputError("Embedding input must be nonblank text")
    if len(text) > CHUNKING_SETTINGS.chunk_size:
        raise EmbeddingInputError("Embedding chunk exceeds the configured character limit")


def validate_embedding_vectors(vectors: list[list[float]], count: int) -> None:
    if len(vectors) != count:
        raise RuntimeError("Embedding provider returned the wrong number of vectors")
    for vector in vectors:
        if len(vector) != EMBEDDING_DIMENSIONS or not all(isfinite(value) for value in vector):
            raise RuntimeError("Embedding provider returned an invalid vector")
        if not any(value != 0 for value in vector):
            raise RuntimeError("Embedding provider returned a zero vector")


def embed_documents(embedder: DocumentEmbedder, texts: list[str]) -> list[list[float]]:
    for text in texts:
        validate_embedding_input(text)
    if not texts:
        return []
    if len(texts) > BATCH_SIZE:
        raise EmbeddingInputError("Embedding batch exceeds the configured limit")
    vectors = embedder.embed(texts)
    validate_embedding_vectors(vectors, len(texts))
    return vectors
