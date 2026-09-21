"""Process one owned document revision and commit its chunks and outcome together."""

import logging
from typing import Literal

from ragnarok_ingestion.chunk_config_repository import insert_chunk_config_if_missing
from ragnarok_ingestion.chunk_repository import replace_document_chunks
from ragnarok_ingestion.chunking import TextChunk
from ragnarok_ingestion.database import connect_database
from ragnarok_ingestion.document_repository import (
    try_lock_document,
    update_status_for_user,
)
from ragnarok_ingestion.ingestion_input import IngestionJobInput
from ragnarok_ingestion.embedding import (
    MODEL_NAME, MODEL_REVISION, TOKEN_CHUNKING_METHOD, TOKEN_CHUNKING_SETTINGS,
    EmbeddingInputError, LocalEmbedder, chunk_for_embedding, embed_documents,
)
from ragnarok_ingestion.pdf_processing import process_pdf
from ragnarok_ingestion.pdf_extraction import PdfExtractionError


logger = logging.getLogger(__name__)


class DocumentBusyError(Exception):
    """Another worker owns the document's advisory lock."""


def ingest_document(
    database_url: str, job: IngestionJobInput, embedder: LocalEmbedder,
) -> Literal["completed", "failed", "ignored"]:
    # A dedicated connection is required: closing it releases the advisory lock.
    logger.info("event=ingestion_stage stage=database_connect document=%s revision=%s", job.document_id, job.revision)
    with connect_database(database_url) as connection:
        if not try_lock_document(connection, job.document_id):
            raise DocumentBusyError("Document is being processed")

        logger.info("event=ingestion_stage stage=claim document=%s revision=%s", job.document_id, job.revision)
        with connection.transaction():
            source = update_status_for_user(
                connection, job.user_id, job.document_id, job.revision,
                ["queued", "processing"], "processing",
            )
        if source is None:
            logger.info("event=ingestion_ignored document=%s revision=%s", job.document_id, job.revision)
            return "ignored"

        # This computation runs after the processing transaction has committed.
        logger.info("event=ingestion_stage stage=chunking document=%s revision=%s source_type=%s",
                    job.document_id, job.revision, source.source_type)
        error_message: str | None = None
        chunks: list[TextChunk] = []
        embeddings: list[list[float]] = []
        try:
            if source.source_type == "text":
                text = source.source_text
                if text is None or not text.strip() or len(text) > 100_000:
                    error_message = "Text must contain between 1 and 100,000 characters."
                else:
                    chunks = chunk_for_embedding(text, embedder.tokenizer)
            elif source.source_type == "pdf":
                if source.storage_key is None:
                    raise RuntimeError("PDF source has no storage key")
                # Only the owned current revision can supply this storage key.
                for page in process_pdf(source.storage_key):
                    for chunk in chunk_for_embedding(page.text, embedder.tokenizer):
                        chunks.append(TextChunk(len(chunks), chunk.text, page.page_number))
            else:
                raise RuntimeError("Unsupported document source type")

            if error_message is None:
                if not chunks:
                    raise RuntimeError("Chunk output must not be empty")
                logger.info("event=ingestion_stage stage=embedding document=%s revision=%s chunk_count=%s model=%s",
                            job.document_id, job.revision, len(chunks), MODEL_NAME)
                embeddings = embed_documents(embedder, [chunk.text for chunk in chunks])
        except (PdfExtractionError, EmbeddingInputError) as error:
            error_message = str(error)

        if error_message is not None:
            logger.warning("event=ingestion_rejected document=%s revision=%s source_type=%s",
                           job.document_id, job.revision, source.source_type)
            with connection.transaction():
                failed = update_status_for_user(
                    connection, job.user_id, job.document_id, job.revision,
                    ["processing"], "failed", error_message,
                )
            return "failed" if failed is not None else "ignored"

        logger.info("event=ingestion_stage stage=persist document=%s revision=%s chunk_count=%s",
                    job.document_id, job.revision, len(chunks))
        with connection.transaction():
            completed = update_status_for_user(
                connection, job.user_id, job.document_id, job.revision,
                ["processing"], "completed",
            )
            if completed is None:
                return "ignored"
            config_id = insert_chunk_config_if_missing(
                connection, TOKEN_CHUNKING_METHOD,
                TOKEN_CHUNKING_SETTINGS.chunk_size, TOKEN_CHUNKING_SETTINGS.chunk_overlap,
            )
            replace_document_chunks(
                connection, job.document_id, job.user_id, job.revision, config_id,
                chunks, embeddings, MODEL_NAME, MODEL_REVISION,
            )
        return "completed"
