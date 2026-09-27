"""OpenRouter embedding transport for the ingestion worker."""

from dataclasses import dataclass
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ragnarok_ingestion.embedding import (
    EMBEDDING_DIMENSIONS, MODEL_NAME, RESPONSE_MODEL_NAME,
)

DEFAULT_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
REQUEST_TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 2_000_000


class EmbeddingUnavailableError(Exception):
    """A provider or transport failure that the consumer may retry."""


class EmbeddingItem(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    index: int = Field(ge=0)
    embedding: list[float] = Field(min_length=EMBEDDING_DIMENSIONS, max_length=EMBEDDING_DIMENSIONS)


class EmbeddingResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    model: str
    data: list[EmbeddingItem]


@dataclass(frozen=True)
class OpenRouterEmbedder:
    api_key: str
    url: str = DEFAULT_EMBEDDINGS_URL

    def embed(self, texts: list[str]) -> list[list[float]]:
        payload = json.dumps({
            "model": MODEL_NAME,
            "dimensions": EMBEDDING_DIMENSIONS,
            "input": texts,
            "encoding_format": "float",
        }).encode()
        request = Request(self.url, data=payload, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }, method="POST")
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                raise EmbeddingUnavailableError("Embedding response exceeds the configured limit")
            result = EmbeddingResponse.model_validate_json(body)
            if result.model not in (MODEL_NAME, RESPONSE_MODEL_NAME) or len(result.data) != len(texts):
                raise EmbeddingUnavailableError("Invalid embedding response")
            ordered = sorted(result.data, key=lambda item: item.index)
            if [item.index for item in ordered] != list(range(len(texts))):
                raise EmbeddingUnavailableError("Invalid embedding response")
            return [item.embedding for item in ordered]
        except HTTPError:
            raise EmbeddingUnavailableError("Embedding provider unavailable") from None
        except (URLError, OSError, TimeoutError, ValidationError):
            raise EmbeddingUnavailableError("Embedding provider unavailable") from None


def load_openrouter_embedder() -> OpenRouterEmbedder:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise ValueError("Set OPENROUTER_API_KEY before starting the worker")
    url = os.environ.get("OPENROUTER_EMBEDDINGS_URL", DEFAULT_EMBEDDINGS_URL).strip()
    if not url.startswith(("https://", "http://127.0.0.1:", "http://localhost:")):
        raise ValueError("Set OPENROUTER_EMBEDDINGS_URL to an HTTPS URL")
    return OpenRouterEmbedder(api_key, url)
