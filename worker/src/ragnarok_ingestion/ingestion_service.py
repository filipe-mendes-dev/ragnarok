"""Process one text revision and commit its chunks and outcome together."""

from typing import Literal

from ragnarok_ingestion.chunk_config_repository import insert_chunk_config_if_missing
from ragnarok_ingestion.chunk_repository import replace_document_chunks
from ragnarok_ingestion.chunking import CHUNKING_METHOD, ChunkingSettings, chunk_text
from ragnarok_ingestion.database import connect_database
from ragnarok_ingestion.document_repository import (
    try_lock_document,
    update_text_status_for_user,
)
from ragnarok_ingestion.ingestion_input import IngestionJobInput


class DocumentBusyError(Exception):
    """Another worker owns the document's advisory lock."""


def ingest_text_document(
    database_url: str, job: IngestionJobInput
) -> Literal["completed", "failed", "ignored"]:
    # A dedicated connection is required: closing it releases the advisory lock.
    with connect_database(database_url) as connection:
        if not try_lock_document(connection, job.document_id):
            raise DocumentBusyError("Document is being processed")

        with connection.transaction():
            source = update_text_status_for_user(
                connection, job.user_id, job.document_id, job.revision,
                ["queued", "processing"], "processing",
            )
        if source is None:
            return "ignored"

        # This computation runs after the processing transaction has committed.
        settings = ChunkingSettings()
        if not source.source_text.strip() or len(source.source_text) > 100_000:
            with connection.transaction():
                failed = update_text_status_for_user(
                    connection, job.user_id, job.document_id, job.revision,
                    ["processing"], "failed",
                    "Text must contain between 1 and 100,000 characters.",
                )
            return "failed" if failed is not None else "ignored"

        chunks = chunk_text(source.source_text, settings)
        if not chunks or any(len(chunk.text) > settings.chunk_size for chunk in chunks):
            raise RuntimeError("Chunk output violates the configured size")

        with connection.transaction():
            completed = update_text_status_for_user(
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
