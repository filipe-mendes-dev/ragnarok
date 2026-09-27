"""From worker/: uv run python examples/embed_text.py"""

from math import isclose
from itertools import batched
from time import perf_counter

from ragnarok_ingestion.embedding import (
    BATCH_SIZE, MODEL_NAME,
    chunk_for_embedding,
    embed_documents,
)
from ragnarok_ingestion.openrouter_embedding import load_openrouter_embedder

PASSAGES = [
    "Original PDF files are stored in S3-compatible object storage.",
    "RabbitMQ delivers ingestion jobs to the Python worker.",
    "PostgreSQL stores document metadata and processing status.",
]


def main() -> None:
    started = perf_counter()
    embedder = load_openrouter_embedder()
    print(f"Configured {MODEL_NAME} in {perf_counter() - started:.2f}s")

    chunks = chunk_for_embedding(" ".join(PASSAGES * 100))
    print(f"Long sample: {len(chunks)} chunks; largest input: {max(len(chunk.text) for chunk in chunks)} characters")

    started = perf_counter()
    chunk_vectors = [
        vector
        for batch in batched(chunks, BATCH_SIZE)
        for vector in embed_documents(embedder, [chunk.text for chunk in batch])
    ]
    print(f"Embedded {len(chunk_vectors)} chunks in {perf_counter() - started:.2f}s")

    vectors = embed_documents(embedder, PASSAGES)
    started = perf_counter()
    query = embed_documents(embedder, ["Where are the original PDF files saved?"])[0]
    print(f"Query embedding: {(perf_counter() - started) * 1_000:.1f}ms")

    for vector in [*vectors, query]:
        assert isclose(sum(value * value for value in vector), 1.0, abs_tol=1e-5)
    scores = [sum(a * b for a, b in zip(query, vector, strict=True)) for vector in vectors]
    best = scores.index(max(scores))
    assert best == 0, "Expected the original PDF storage passage to rank first"
    print(f"Top passage, cosine similarity {scores[best]:.3f}: {PASSAGES[best]}")


if __name__ == "__main__":
    main()
