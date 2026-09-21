"""CPU embeddings with explicit, non-truncating input limits."""

from collections.abc import Iterable
from dataclasses import dataclass
from math import isfinite
from pathlib import Path
from typing import Protocol, SupportsFloat

from fastembed import TextEmbedding
from tokenizers import Tokenizer

from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk, chunk_text

MODEL_NAME = "BAAI/bge-small-en-v1.5"
MODEL_REVISION = "Qdrant/bge-small-en-v1.5-onnx-Q@52398278842ec682c6f32300af41344b1c0b0bb2"
DEFAULT_MODEL_DIRECTORY = Path(__file__).resolve().parents[2] / "models" / "bge-small-en-v1.5"
EMBEDDING_DIMENSIONS = 384
MAX_INPUT_TOKENS = 512
BATCH_SIZE = 8
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
TOKEN_CHUNKING_SETTINGS = ChunkingSettings(chunk_size=384, chunk_overlap=48)
TOKEN_CHUNKING_METHOD = "recursive-bge-small-en-v1.5-token-v1"


class EmbeddingInputError(ValueError):
    """A rejected input with a fixed, safe message for document status."""


class EmbeddingModel(Protocol):
    def embed(
        self, documents: list[str], *, batch_size: int, parallel: None,
    ) -> Iterable[Iterable[SupportsFloat]]: ...


@dataclass(frozen=True)
class LocalEmbedder:
    tokenizer: Tokenizer
    model: EmbeddingModel


def load_local_embedder(model_directory: Path) -> LocalEmbedder:
    """Load one resident CPU model from a provisioned directory, without downloads."""
    for filename in (
        "model_optimized.onnx", "tokenizer.json", "config.json",
        "tokenizer_config.json", "special_tokens_map.json",
    ):
        if not (model_directory / filename).is_file():
            raise FileNotFoundError(f"Missing model file: {filename}. Follow worker/README.md setup.")
    tokenizer = Tokenizer.from_file(str(model_directory / "tokenizer.json"))
    tokenizer.no_truncation()
    tokenizer.no_padding()
    model = TextEmbedding(
        model_name=MODEL_NAME,
        specific_model_path=str(model_directory),
        local_files_only=True,
        threads=2,
        providers=["CPUExecutionProvider"],
    )
    return LocalEmbedder(tokenizer=tokenizer, model=model)


def count_input_tokens(tokenizer: Tokenizer, text: str) -> int:
    """Include special tokens, with truncation and padding disabled at load time."""
    return len(tokenizer.encode(text, add_special_tokens=True).ids)


def chunk_for_embedding(text: str, tokenizer: Tokenizer) -> list[TextChunk]:
    def count_content_tokens(value: str) -> int:
        return len(tokenizer.encode(value, add_special_tokens=False).ids)

    chunks = chunk_text(
        text, TOKEN_CHUNKING_SETTINGS, length_function=count_content_tokens,
    )
    for chunk in chunks:
        # Token counts can change when fragments are joined; check final strings.
        if count_content_tokens(chunk.text) > TOKEN_CHUNKING_SETTINGS.chunk_size:
            raise EmbeddingInputError("Chunk exceeds the 384-content-token budget")
        validate_embedding_input(tokenizer, chunk.text)
    return chunks


def validate_embedding_input(tokenizer: Tokenizer, text: str) -> None:
    if not isinstance(text, str) or not text.strip():
        raise EmbeddingInputError("Embedding input must be nonblank text")
    if count_input_tokens(tokenizer, text) > MAX_INPUT_TOKENS:
        raise EmbeddingInputError("Embedding input exceeds 512 tokens; split it before embedding")


def embed_documents(embedder: LocalEmbedder, texts: list[str]) -> list[list[float]]:
    """Validate the complete request before running small sequential batches."""
    for text in texts:
        validate_embedding_input(embedder.tokenizer, text)
    if not texts:
        return []

    vectors: list[list[float]] = []
    for vector in embedder.model.embed(texts, batch_size=BATCH_SIZE, parallel=None):
        values = [float(value) for value in vector]
        if len(values) != EMBEDDING_DIMENSIONS or not all(isfinite(value) for value in values):
            raise RuntimeError("Embedding model returned an invalid vector")
        if not any(value != 0 for value in values):
            raise RuntimeError("Embedding model returned a zero vector")
        vectors.append(values)
    if len(vectors) != len(texts):
        raise RuntimeError("Embedding model returned the wrong number of vectors")
    return vectors


def embed_query(embedder: LocalEmbedder, text: str) -> list[float]:
    validate_embedding_input(embedder.tokenizer, text)
    return embed_documents(embedder, [QUERY_PREFIX + text])[0]
