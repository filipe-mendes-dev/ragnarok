"""HTTP validation, shared inference, and bounded scheduling without model downloads."""

import asyncio
import logging
from contextlib import suppress

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace

from ragnarok_ingestion.embedding import LocalEmbedder, QUERY_PREFIX
from ragnarok_ingestion.embedding_http import EmbeddingRequest, EmbeddingResponse
from ragnarok_ingestion.embedding_server import EmbeddingScheduler, create_app


class RecordingModel:
    def __init__(self) -> None:
        self.texts: list[str] = []

    def embed(self, documents: list[str], *, batch_size: int, parallel: None) -> list[list[float]]:
        self.texts.extend(documents)
        return [[1.0] + [0.0] * 383 for text in documents]


@pytest.fixture
def embedder() -> LocalEmbedder:
    tokenizer = Tokenizer(WordLevel({"[UNK]": 0}, unk_token="[UNK]"))
    tokenizer.pre_tokenizer = Whitespace()
    return LocalEmbedder(tokenizer, RecordingModel())


def test_query_and_document_http_clients_share_one_model(
    embedder: LocalEmbedder, caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="ragnarok_ingestion.embedding_server")
    with TestClient(create_app(embedder)) as client:
        response = client.post("/embed", json={"kind": "query", "texts": ["refund policy"]})
        assert response.status_code == 200
        query = EmbeddingResponse.model_validate_json(response.content)
        response = client.post("/embed", json={"kind": "document", "texts": ["A private document"]})
        assert response.status_code == 200
        document = EmbeddingResponse.model_validate_json(response.content)
        assert document.vectors == query.vectors == [[1.0] + [0.0] * 383]
        assert isinstance(embedder.model, RecordingModel)
        assert embedder.model.texts == [QUERY_PREFIX + "refund policy", "A private document"]
    assert "event=embedding_service_ready" in caplog.text
    assert "event=embedding_completed request=0 kind=query batch_size=1 duration_ms=" in caplog.text
    assert "event=embedding_completed request=1 kind=document batch_size=1 duration_ms=" in caplog.text
    assert "event=embedding_service_stopped" in caplog.text
    assert "refund policy" not in caplog.text
    assert "A private document" not in caplog.text


@pytest.mark.parametrize("payload", [
    {"kind": "query", "texts": ["one", "two"]},
    {"kind": "query", "texts": ["word " * 513]},
    {"kind": "document", "texts": ["text"] * 9},
    {"kind": "query", "texts": [" "]},
    {"kind": "query", "texts": ["text"], "unexpected": True},
])
def test_invalid_requests_never_run_inference(
    embedder: LocalEmbedder, payload: dict[str, object], caplog: pytest.LogCaptureFixture,
) -> None:
    with TestClient(create_app(embedder)) as client:
        response = client.post("/embed", json=payload)
        assert response.status_code == 422
        assert response.json() == {"error": "invalid_input"}
        assert isinstance(embedder.model, RecordingModel)
        assert embedder.model.texts == []
    assert "event=embedding_rejected" in caplog.text


def test_body_limit_applies_before_json_parsing(embedder: LocalEmbedder) -> None:
    with TestClient(create_app(embedder)) as client:
        response = client.post("/embed", content=b"x" * 100_001, headers={"Content-Type": "application/json"})
        assert response.status_code == 413
        assert response.json() == {"error": "too_large"}
        assert isinstance(embedder.model, RecordingModel)
        assert embedder.model.texts == []


def test_openapi_documents_the_embedding_contract(embedder: LocalEmbedder) -> None:
    with TestClient(create_app(embedder)) as client:
        schema = client.get("/openapi.json").json()
        assert schema["paths"]["/embed"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/EmbeddingRequest",
        }


def test_waiting_queries_run_before_document_batches(embedder: LocalEmbedder) -> None:
    async def exercise() -> None:
        scheduler = EmbeddingScheduler(embedder)
        document = asyncio.create_task(scheduler.submit(EmbeddingRequest(kind="document", texts=["document"])))
        query = asyncio.create_task(scheduler.submit(EmbeddingRequest(kind="query", texts=["query"])))
        await asyncio.sleep(0)
        worker = asyncio.create_task(scheduler.run())
        try:
            await asyncio.gather(document, query)
            assert isinstance(embedder.model, RecordingModel)
            assert embedder.model.texts == [QUERY_PREFIX + "query", "document"]
        finally:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
    asyncio.run(exercise())


def test_full_queue_rejects_excess_work_and_cancelled_requests_skip_inference(embedder: LocalEmbedder) -> None:
    async def exercise() -> None:
        scheduler = EmbeddingScheduler(embedder)
        tasks = [asyncio.create_task(scheduler.submit(EmbeddingRequest(kind="document", texts=["text"]))) for index in range(16)]
        await asyncio.sleep(0)
        with pytest.raises(asyncio.QueueFull):
            await scheduler.submit(EmbeddingRequest(kind="query", texts=["query"]))
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        worker = asyncio.create_task(scheduler.run())
        try:
            await scheduler.queue.join()
            assert isinstance(embedder.model, RecordingModel)
            assert embedder.model.texts == []
        finally:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
    asyncio.run(exercise())


def test_response_rejects_incompatible_model_and_invalid_vectors() -> None:
    with pytest.raises(ValidationError):
        EmbeddingResponse.model_validate({"model": "other", "revision": "other", "vectors": [[0.0] * 384]})
