import pytest

from ragnarok_ingestion.embedding import (
    CHUNKING_SETTINGS, EMBEDDING_DIMENSIONS, EmbeddingInputError,
    chunk_for_embedding, embed_documents,
)


class FakeEmbedder:
    def __init__(self, vectors: list[list[float]]) -> None:
        self.vectors = vectors
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return self.vectors


def test_character_chunks_preserve_words_and_fit_budget() -> None:
    words = [f"word{index}" for index in range(1000)]
    chunks = chunk_for_embedding(" ".join(words))

    assert len(chunks) > 1
    assert [chunk.ordinal for chunk in chunks] == list(range(len(chunks)))
    assert all(len(chunk.text) <= CHUNKING_SETTINGS.chunk_size for chunk in chunks)
    recovered: list[str] = []
    for chunk in chunks:
        for word in chunk.text.split():
            if word not in recovered:
                recovered.append(word)
    assert recovered == words
    assert chunk_for_embedding(" ".join(words)) == chunks


@pytest.mark.parametrize("invalid", ["", " \n ", "a" * (CHUNKING_SETTINGS.chunk_size + 1)])
def test_rejects_entire_request_before_provider_call(invalid: str) -> None:
    embedder = FakeEmbedder([])
    with pytest.raises(EmbeddingInputError):
        embed_documents(embedder, ["word", invalid])
    assert embedder.calls == []


@pytest.mark.parametrize("vectors", [
    [[1.0] * (EMBEDDING_DIMENSIONS - 1)],
    [[float("nan")] * EMBEDDING_DIMENSIONS],
    [[float("inf")] * EMBEDDING_DIMENSIONS],
    [[0.0] * EMBEDDING_DIMENSIONS],
    [],
    [[1.0] * EMBEDDING_DIMENSIONS, [1.0] * EMBEDDING_DIMENSIONS],
])
def test_rejects_invalid_provider_output(vectors: list[list[float]]) -> None:
    with pytest.raises(RuntimeError):
        embed_documents(FakeEmbedder(vectors), ["word"])


def test_empty_request_does_not_call_provider() -> None:
    embedder = FakeEmbedder([])
    assert embed_documents(embedder, []) == []
    assert embedder.calls == []
