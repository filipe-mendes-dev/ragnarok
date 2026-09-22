"""One resident model, a bounded queue, and query priority between batches."""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from itertools import count
import logging
import os
from pathlib import Path
from time import perf_counter

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
import uvicorn

from ragnarok_ingestion.embedding import (
    DEFAULT_MODEL_DIRECTORY, MODEL_NAME, MODEL_REVISION, LocalEmbedder,
    EmbeddingInputError, embed_documents, embed_query, load_local_embedder,
)
from ragnarok_ingestion.embedding_http import EmbeddingRequest, EmbeddingResponse


logger = logging.getLogger(__name__)


@dataclass(order=True)
class PendingEmbedding:
    priority: int
    sequence: int
    request: EmbeddingRequest = field(compare=False)
    result: asyncio.Future[list[list[float]]] = field(compare=False)


class EmbeddingScheduler:
    def __init__(self, embedder: LocalEmbedder) -> None:
        self.embedder = embedder
        self.queue: asyncio.PriorityQueue[PendingEmbedding] = asyncio.PriorityQueue(maxsize=16)
        self.sequence = count()

    def infer(self, request: EmbeddingRequest) -> list[list[float]]:
        if request.kind == "query":
            return [embed_query(self.embedder, request.texts[0])]
        return embed_documents(self.embedder, request.texts)

    async def submit(self, request: EmbeddingRequest) -> list[list[float]]:
        result: asyncio.Future[list[list[float]]] = asyncio.get_running_loop().create_future()
        request_id = next(self.sequence)
        started = perf_counter()
        logger.info("event=embedding_requested request=%s kind=%s batch_size=%s queued=%s",
                    request_id, request.kind, len(request.texts), self.queue.qsize())
        try:
            self.queue.put_nowait(PendingEmbedding(
                0 if request.kind == "query" else 1, request_id, request, result,
            ))
            async with asyncio.timeout(15):
                vectors = await result
            logger.info("event=embedding_completed request=%s kind=%s batch_size=%s duration_ms=%s",
                        request_id, request.kind, len(request.texts), round((perf_counter() - started) * 1000))
            return vectors
        except Exception as error:
            logger.warning("event=embedding_failed request=%s kind=%s error=%s duration_ms=%s",
                           request_id, request.kind, type(error).__name__, round((perf_counter() - started) * 1000))
            raise
        finally:
            result.cancel()

    async def run(self) -> None:
        while True:
            pending = await self.queue.get()
            try:
                if pending.result.cancelled():
                    continue
                try:
                    vectors = await asyncio.to_thread(self.infer, pending.request)
                except Exception as error:
                    if not pending.result.done():
                        pending.result.set_exception(error)
                else:
                    if not pending.result.done():
                        pending.result.set_result(vectors)
            finally:
                self.queue.task_done()


class BoundedRequest(Request):
    _bounded_body: bytes | None = None

    async def body(self) -> bytes:
        if self._bounded_body is None:
            body = bytearray()
            try:
                async with asyncio.timeout(5):
                    async for part in self.stream():
                        if len(body) + len(part) > 100_000:
                            raise HTTPException(status_code=413, detail="too_large")
                        body.extend(part)
            except TimeoutError:
                raise HTTPException(status_code=503, detail="busy") from None
            self._bounded_body = bytes(body)
        return self._bounded_body


class BoundedRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            return await handler(BoundedRequest(request.scope, request.receive))

        return handle


def create_app(embedder: LocalEmbedder) -> FastAPI:
    scheduler = EmbeddingScheduler(embedder)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        task = asyncio.create_task(scheduler.run())
        logger.info("event=embedding_service_ready model=%s revision=%s", MODEL_NAME, MODEL_REVISION)
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            logger.info("event=embedding_service_stopped")

    app = FastAPI(title="RAGnarok embeddings", lifespan=lifespan)
    app.router.route_class = BoundedRoute

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, error: RequestValidationError) -> JSONResponse:
        logger.warning("event=embedding_rejected reason=invalid_input")
        return JSONResponse({"error": "invalid_input"}, status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        logger.warning("event=embedding_rejected status=%s", error.status_code)
        return JSONResponse({"error": error.detail}, status_code=error.status_code)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ready", "model": MODEL_NAME, "revision": MODEL_REVISION}

    @app.post("/embed", response_model=EmbeddingResponse)
    async def embed(payload: EmbeddingRequest) -> EmbeddingResponse:
        if payload.kind == "query" and len(payload.texts) != 1:
            raise HTTPException(status_code=422, detail="invalid_input")
        try:
            vectors = await scheduler.submit(payload)
            return EmbeddingResponse(model=MODEL_NAME, revision=MODEL_REVISION, vectors=vectors)
        except EmbeddingInputError:
            raise HTTPException(status_code=422, detail="invalid_input") from None
        except (asyncio.QueueFull, TimeoutError):
            raise HTTPException(status_code=503, detail="busy") from None
        except Exception:
            raise HTTPException(status_code=503, detail="unavailable") from None

    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    directory = Path(os.environ.get("EMBEDDING_MODEL_DIR", str(DEFAULT_MODEL_DIRECTORY)))
    logger.info("event=embedding_model_loading model=%s", MODEL_NAME)
    embedder = load_local_embedder(directory)
    uvicorn.run(
        create_app(embedder), host=os.environ.get("EMBEDDING_HOST", "127.0.0.1"),
        port=int(os.environ.get("EMBEDDING_PORT", "8081")), access_log=False, workers=1,
    )


if __name__ == "__main__":
    main()
