from pathlib import Path

import pytest
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.processors import TemplateProcessing

from ragnarok_ingestion.embedding import (
    LocalEmbedder,
    QUERY_PREFIX,
    chunk_for_embedding,
    count_input_tokens,
    embed_documents,
    embed_query,
    load_local_embedder,
)


class FakeModel:
    def __init__(self, vectors: list[list[float]]) -> None:
        self.vectors = vectors
        self.calls = 0
        self.documents: list[str] = []

    def embed(
        self, documents: list[str], *, batch_size: int, parallel: None,
    ) -> list[list[float]]:
        assert batch_size == 8
        assert parallel is None
        self.calls += 1
        self.documents = documents
        return self.vectors


@pytest.fixture
def tokenizer() -> Tokenizer:
    result = Tokenizer(WordLevel(
        {"[UNK]": 0, "[CLS]": 1, "[SEP]": 2, "word": 3}, unk_token="[UNK]",
    ))
    result.pre_tokenizer = Whitespace()
    result.post_processor = TemplateProcessing(
        single="[CLS] $A [SEP]", special_tokens=[("[CLS]", 1), ("[SEP]", 2)],
    )
    return result


def test_token_chunks_preserve_words_and_fit_both_budgets(tokenizer: Tokenizer) -> None:
    words = [f"word{index}" for index in range(1_000)]
    chunks = chunk_for_embedding(" ".join(words), tokenizer)

    assert len(chunks) > 1
    assert [chunk.ordinal for chunk in chunks] == list(range(len(chunks)))
    assert all(count_input_tokens(tokenizer, chunk.text) <= 386 for chunk in chunks)
    assert any(len(chunk.text) > 384 for chunk in chunks)
    recovered: list[str] = []
    for chunk in chunks:
        for word in chunk.text.split():
            if word not in recovered:
                recovered.append(word)
    assert recovered == words
    assert chunk_for_embedding(" ".join(words), tokenizer) == chunks


def test_accepts_exactly_512_tokens_including_special_tokens(tokenizer: Tokenizer) -> None:
    expected = [[1.0] + [0.0] * 383]
    model = FakeModel(expected)
    embedder = LocalEmbedder(tokenizer, model)
    text = " ".join(["word"] * 510)

    assert count_input_tokens(tokenizer, text) == 512
    assert embed_documents(embedder, [text]) == expected
    assert model.calls == 1


@pytest.mark.parametrize("invalid", ["", " \n ", "word " * 511])
def test_rejects_entire_request_before_inference(
    tokenizer: Tokenizer, invalid: str,
) -> None:
    model = FakeModel([])
    with pytest.raises(ValueError):
        embed_documents(LocalEmbedder(tokenizer, model), ["word", invalid])
    assert model.calls == 0


def test_query_prefix_counts_toward_limit(tokenizer: Tokenizer) -> None:
    model = FakeModel([])
    with pytest.raises(ValueError, match="512 tokens"):
        embed_query(LocalEmbedder(tokenizer, model), "word " * 510)
    assert model.calls == 0


def test_query_adds_instruction_and_returns_one_vector(tokenizer: Tokenizer) -> None:
    expected = [1.0] + [0.0] * 383
    model = FakeModel([expected])

    assert embed_query(LocalEmbedder(tokenizer, model), "word") == expected
    assert model.documents == [QUERY_PREFIX + "word"]


@pytest.mark.parametrize("vectors", [
    [[1.0] * 383],
    [[float("nan")] * 384],
    [[float("inf")] * 384],
    [[0.0] * 384],
    [],
    [[1.0] * 384, [1.0] * 384],
])
def test_rejects_invalid_model_output(
    tokenizer: Tokenizer, vectors: list[list[float]],
) -> None:
    with pytest.raises(RuntimeError):
        embed_documents(LocalEmbedder(tokenizer, FakeModel(vectors)), ["word"])


def test_empty_request_does_not_run_inference(tokenizer: Tokenizer) -> None:
    model = FakeModel([])
    assert embed_documents(LocalEmbedder(tokenizer, model), []) == []
    assert model.calls == 0


def test_missing_local_model_fails_with_setup_guidance(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Follow worker/README.md setup"):
        load_local_embedder(tmp_path)
