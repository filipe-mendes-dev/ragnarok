import json
from urllib.error import HTTPError, URLError
from unittest.mock import patch

import pytest

from ragnarok_ingestion.embedding import EMBEDDING_DIMENSIONS, MODEL_NAME, RESPONSE_MODEL_NAME
from ragnarok_ingestion.openrouter_embedding import (
    EmbeddingUnavailableError, OpenRouterEmbedder, load_openrouter_embedder,
)


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exception_type: object, exception: object, traceback: object) -> None:
        return None

    def read(self, limit: int) -> bytes:
        return self.body[:limit]


def vector(index: int) -> list[float]:
    values = [0.0] * EMBEDDING_DIMENSIONS
    values[index] = 1.0
    return values


def test_sends_batch_with_model_dimensions_and_bearer_key() -> None:
    embedder = OpenRouterEmbedder("private-key")
    body = json.dumps({"model": RESPONSE_MODEL_NAME, "data": [
        {"index": 1, "embedding": vector(1)},
        {"index": 0, "embedding": vector(0)},
    ]}).encode()
    with patch("ragnarok_ingestion.openrouter_embedding.urlopen", return_value=FakeResponse(body)) as open_url:
        assert embedder.embed(["first", "second"]) == [vector(0), vector(1)]

    request = open_url.call_args.args[0]
    assert request.get_header("Authorization") == "Bearer private-key"
    assert request.get_method() == "POST"
    assert json.loads(request.data) == {
        "model": MODEL_NAME, "dimensions": EMBEDDING_DIMENSIONS,
        "input": ["first", "second"], "encoding_format": "float",
    }


@pytest.mark.parametrize("response", [
    {"model": "other", "data": [{"index": 0, "embedding": vector(0)}]},
    {"model": MODEL_NAME, "data": [{"index": 1, "embedding": vector(0)}]},
    {"model": MODEL_NAME, "data": [{"index": 0, "embedding": [1.0]}]},
    {"model": MODEL_NAME, "data": [{"index": 0, "embedding": [float("nan")] * EMBEDDING_DIMENSIONS}]},
])
def test_rejects_malformed_provider_response(response: dict[str, object]) -> None:
    embedder = OpenRouterEmbedder("private-key")
    body = json.dumps(response).encode()
    with patch("ragnarok_ingestion.openrouter_embedding.urlopen", return_value=FakeResponse(body)):
        with pytest.raises(EmbeddingUnavailableError):
            embedder.embed(["first"])


def test_maps_provider_rejection_and_transport_failure_without_body() -> None:
    embedder = OpenRouterEmbedder("private-key")
    with patch("ragnarok_ingestion.openrouter_embedding.urlopen", side_effect=HTTPError("https://example.test", 400, "secret", {}, None)):
        with pytest.raises(EmbeddingUnavailableError, match="provider unavailable"):
            embedder.embed(["first"])
    with patch("ragnarok_ingestion.openrouter_embedding.urlopen", side_effect=URLError("private detail")):
        with pytest.raises(EmbeddingUnavailableError, match="provider unavailable"):
            embedder.embed(["first"])


def test_requires_worker_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        load_openrouter_embedder()
