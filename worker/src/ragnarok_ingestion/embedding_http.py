"""Validated HTTP contract and synchronous document-inference adapter."""

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from tokenizers import Tokenizer

from ragnarok_ingestion.embedding import (
    BATCH_SIZE, EMBEDDING_DIMENSIONS, MODEL_NAME, MODEL_REVISION,
    EmbeddingInputError, load_tokenizer,
)


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    kind: Literal["query", "document"]
    texts: list[str] = Field(min_length=1, max_length=BATCH_SIZE)

    @field_validator("texts")
    @classmethod
    def validate_texts(cls, texts: list[str]) -> list[str]:
        if any(not text.strip() or len(text) > 10_000 for text in texts):
            raise ValueError("Texts must contain between 1 and 10,000 characters")
        return texts


class EmbeddingResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)
    model: Literal[MODEL_NAME]
    revision: Literal[MODEL_REVISION]
    vectors: list[list[float]] = Field(min_length=1, max_length=BATCH_SIZE)

    @field_validator("vectors")
    @classmethod
    def validate_vectors(cls, vectors: list[list[float]]) -> list[list[float]]:
        if any(len(vector) != EMBEDDING_DIMENSIONS or not any(vector) for vector in vectors):
            raise ValueError("Invalid embedding vectors")
        return vectors


class EmbeddingUnavailableError(Exception):
    """A transient inference transport or capacity failure."""


@dataclass
class RemoteEmbeddingModel:
    url: str

    def embed(
        self, documents: list[str], *, batch_size: int, parallel: None,
    ) -> list[list[float]]:
        payload = EmbeddingRequest(kind="document", texts=documents)
        request = Request(
            self.url + "/embed", data=payload.model_dump_json().encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urlopen(request, timeout=20) as response:
                body = response.read(100_001)
            if len(body) > 100_000:
                raise EmbeddingUnavailableError("Invalid embedding response")
            result = EmbeddingResponse.model_validate_json(body)
            if len(result.vectors) != len(documents):
                raise EmbeddingUnavailableError("Invalid embedding response")
            return result.vectors
        except HTTPError as error:
            if error.code == 422:
                raise EmbeddingInputError("Embedding input exceeds the model limits") from None
            raise EmbeddingUnavailableError("Embedding service unavailable") from None
        except (URLError, OSError, ValidationError, json.JSONDecodeError):
            raise EmbeddingUnavailableError("Embedding service unavailable") from None


@dataclass
class RemoteEmbedder:
    tokenizer: Tokenizer
    model: RemoteEmbeddingModel


def load_remote_embedder(model_directory: Path) -> RemoteEmbedder:
    url = os.environ.get("EMBEDDING_SERVICE_URL", "").rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise ValueError("Set EMBEDDING_SERVICE_URL before starting the worker")
    return RemoteEmbedder(load_tokenizer(model_directory), RemoteEmbeddingModel(url))
