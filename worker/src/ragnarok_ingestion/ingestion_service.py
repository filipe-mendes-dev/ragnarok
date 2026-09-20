"""Process one owned document revision and commit its chunks and outcome together."""

from typing import Literal

from ragnarok_ingestion.chunk_config_repository import insert_chunk_config_if_missing
from ragnarok_ingestion.chunk_repository import replace_document_chunks
from ragnarok_ingestion.chunking import CHUNKING_METHOD, ChunkingSettings, TextChunk, chunk_text
from ragnarok_ingestion.database import connect_database
from ragnarok_ingestion.document_repository import (
    try_lock_document,
    update_status_for_user,
)
from ragnarok_ingestion.ingestion_input import IngestionJobInput
from ragnarok_ingestion.pdf_chunking import chunk_pdf
from ragnarok_ingestion.pdf_extraction import PdfExtractionError
from ragnarok_ingestion.s3_source import PdfSourceError, load_pdf_from_s3


class DocumentBusyError(Exception):
    """Another worker owns the document's advisory lock."""


def ingest_document(
    database_url: str, job: IngestionJobInput,
) -> Literal["completed", "failed", "ignored"]:
    # A dedicated connection is required: closing it releases the advisory lock.
    with connect_database(database_url) as connection:
        if not try_lock_document(connection, job.document_id):
            raise DocumentBusyError("Document is being processed")

        with connection.transaction():
            source = update_status_for_user(
                connection, job.user_id, job.document_id, job.revision,
                ["queued", "processing"], "processing",
            )
        if source is None:
            return "ignored"

        # This computation runs after the processing transaction has committed.
        settings = ChunkingSettings()
        error_message: str | None = None
        chunks: list[TextChunk] = []
        if source.source_type == "text":
            text = source.source_text
            if text is None or not text.strip() or len(text) > 100_000:
                error_message = "Text must contain between 1 and 100,000 characters."
            else:
                chunks = chunk_text(text, settings)
        elif source.source_type == "pdf":
            if source.storage_key is None:
                raise RuntimeError("PDF source has no storage key")
            # Only the owned current revision can supply this storage key.
            try:
                pdf_bytes = load_pdf_from_s3(source.storage_key)
                chunks = chunk_pdf(pdf_bytes, settings)
            except (PdfSourceError, PdfExtractionError) as error:
                error_message = str(error)
        else:
            raise RuntimeError("Unsupported document source type")

        if error_message is not None:
            with connection.transaction():
                failed = update_status_for_user(
                    connection, job.user_id, job.document_id, job.revision,
                    ["processing"], "failed", error_message,
                )
            return "failed" if failed is not None else "ignored"

        if not chunks or any(len(chunk.text) > settings.chunk_size for chunk in chunks):
            raise RuntimeError("Chunk output violates the configured size")

        with connection.transaction():
            completed = update_status_for_user(
                connection, job.user_id, job.document_id, job.revision,
                ["processing"], "completed",
            )
            if completed is None:
                return "ignored"
            config_id = insert_chunk_config_if_missing(
                connection, CHUNKING_METHOD, settings.chunk_size, settings.chunk_overlap
            )
            replace_document_chunks(
                connection, job.document_id, job.user_id, job.revision, config_id, chunks
            )
        return "completed"
