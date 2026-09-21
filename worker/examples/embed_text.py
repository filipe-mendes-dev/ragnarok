"""From worker/: uv run python examples/embed_text.py"""

from math import isclose
from pathlib import Path
from time import perf_counter

from ragnarok_ingestion.embedding import (
    MODEL_NAME,
    chunk_for_embedding,
    count_input_tokens,
    embed_documents,
    embed_query,
    load_local_embedder,
)

PASSAGES = [
    "Original PDF files are stored in S3-compatible object storage.",
    "RabbitMQ delivers ingestion jobs to the Python worker.",
    "PostgreSQL stores document metadata and processing status.",
]


def main() -> None:
    started = perf_counter()
    model_directory = Path(__file__).resolve().parents[1] / "models" / "bge-small-en-v1.5"
    embedder = load_local_embedder(model_directory)
    print(f"Loaded {MODEL_NAME} in {perf_counter() - started:.2f}s")

    chunks = chunk_for_embedding(" ".join(PASSAGES * 100), embedder.tokenizer)
    token_counts = [count_input_tokens(embedder.tokenizer, chunk.text) for chunk in chunks]
    print(f"Long sample: {len(chunks)} chunks; largest input: {max(token_counts)} tokens")

    started = perf_counter()
    chunk_vectors = embed_documents(embedder, [chunk.text for chunk in chunks])
    print(f"Embedded {len(chunk_vectors)} chunks in {perf_counter() - started:.2f}s")

    vectors = embed_documents(embedder, PASSAGES)
    started = perf_counter()
    query = embed_query(embedder, "Where are the original PDF files saved?")
    print(f"Warm query embedding: {(perf_counter() - started) * 1_000:.1f}ms")

    for vector in [*vectors, query]:
        assert isclose(sum(value * value for value in vector), 1.0, abs_tol=1e-5)
    scores = [sum(a * b for a, b in zip(query, vector, strict=True)) for vector in vectors]
    best = scores.index(max(scores))
    assert best == 0, "Expected the original PDF storage passage to rank first"
    print(f"Top passage, cosine similarity {scores[best]:.3f}: {PASSAGES[best]}")


if __name__ == "__main__":
    main()
