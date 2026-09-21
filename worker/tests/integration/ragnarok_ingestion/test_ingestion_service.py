from collections.abc import Iterator
import json
from pathlib import Path
from uuid import uuid4

import pytest
from psycopg.errors import UniqueViolation

from ragnarok_ingestion import ingestion_service
from ragnarok_ingestion.pdf_chunking import chunk_pdf
from ragnarok_ingestion.s3_source import PdfDownloadError
from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk, chunk_text
from ragnarok_ingestion.database import connect_database
from ragnarok_ingestion.document_repository import try_lock_document
from ragnarok_ingestion.ingestion_input import IngestionJobInput, parse_ingestion_job_input
from ragnarok_ingestion.ingestion_service import DocumentBusyError, ingest_document


@pytest.fixture
def queued_job(migrated_database_url: str) -> Iterator[IngestionJobInput]:
    owner_id = str(uuid4())
    job = parse_ingestion_job_input(json.dumps({
        "version": 1, "documentId": str(uuid4()), "revision": 2, "userId": owner_id,
    }).encode())
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            'INSERT INTO "user" (id, name, email) VALUES (%s, %s, %s)',
            (owner_id, "Owner", f"{owner_id}@example.test"),
        )
        try:
            connection.execute(
                """
                INSERT INTO document
                    (id, user_id, title, source_type, source_text, mime_type,
                     size_bytes, revision, status)
                VALUES (%s, %s, 'Notes', 'text', 'Private source text',
                        'text/plain', 19, 2, 'queued')
                """,
                (job.document_id, owner_id),
            )
            yield job
        finally:
            # These tests need real commits, so an outer rollback fixture is unsuitable.
            connection.execute('DELETE FROM "user" WHERE id = %s', (owner_id,))


def test_commits_chunks_and_completion_and_ignores_redelivery(
    migrated_database_url: str, queued_job: IngestionJobInput
) -> None:
    assert ingest_document(migrated_database_url, queued_job) == "completed"
    with connect_database(migrated_database_url) as connection:
        row = connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s",
            (queued_job.document_id,),
        ).fetchone()
        assert row == ("completed", None)
        chunks = connection.execute(
            """
            SELECT c.id, c.revision, c.ordinal, c.text, c.page_number,
                   config.chunking_method, config.chunk_size, config.chunk_overlap
            FROM document_chunk c JOIN chunk_config config ON config.id = c.chunk_config_id
            WHERE c.document_id = %s ORDER BY c.ordinal
            """,
            (queued_job.document_id,),
        ).fetchall()
        assert len(chunks) == 1
        assert chunks[0][1:] == (2, 0, "Private source text", None, "recursive-character-v1", 1000, 150)
        assert ingest_document(migrated_database_url, queued_job) == "ignored"
        assert connection.execute(
            "SELECT id FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchall() == [(chunks[0][0],)]


@pytest.mark.parametrize("change", [{"userId": "another-owner"}, {"revision": 1}])
def test_wrong_owner_or_revision_cannot_change_document(
    migrated_database_url: str, queued_job: IngestionJobInput, change: dict[str, object]
) -> None:
    payload = json.loads(queued_job.model_dump_json(by_alias=True))
    payload.update(change)
    job = parse_ingestion_job_input(json.dumps(payload).encode())
    assert ingest_document(migrated_database_url, job) == "ignored"
    with connect_database(migrated_database_url) as connection:
        assert connection.execute(
            "SELECT status FROM document WHERE id = %s", (queued_job.document_id,)
        ).fetchone() == ("queued",)
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchone() == (0,)


def test_connection_lock_prevents_concurrent_processing_and_is_released_on_close(
    migrated_database_url: str, queued_job: IngestionJobInput
) -> None:
    with connect_database(migrated_database_url) as connection:
        assert try_lock_document(connection, queued_job.document_id)
        with pytest.raises(DocumentBusyError):
            ingest_document(migrated_database_url, queued_job)
    assert ingest_document(migrated_database_url, queued_job) == "completed"


def test_edit_during_chunking_prevents_stale_completion(
    migrated_database_url: str, queued_job: IngestionJobInput, monkeypatch: pytest.MonkeyPatch
) -> None:
    def chunk_with_concurrent_edit(text: str, settings: ChunkingSettings) -> list[TextChunk]:
        with connect_database(migrated_database_url) as connection:
            connection.execute(
                "UPDATE document SET revision = 3, source_text = 'New source', status = 'queued' WHERE id = %s",
                (queued_job.document_id,),
            )
        return chunk_text(text, settings)

    monkeypatch.setattr(ingestion_service, "chunk_text", chunk_with_concurrent_edit)
    assert ingest_document(migrated_database_url, queued_job) == "ignored"
    with connect_database(migrated_database_url) as connection:
        assert connection.execute(
            "SELECT revision, status FROM document WHERE id = %s", (queued_job.document_id,)
        ).fetchone() == (3, "queued")
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchone() == (0,)


def test_insert_failure_rolls_back_completion_and_preserves_old_chunks(
    migrated_database_url: str, queued_job: IngestionJobInput, monkeypatch: pytest.MonkeyPatch
) -> None:
    config_id = uuid4()
    old_chunk_id = uuid4()
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            "INSERT INTO chunk_config (id, chunking_method, chunk_size, chunk_overlap) VALUES (%s, %s, 100, 10)",
            (config_id, f"test-{config_id}"),
        )
        try:
            connection.execute(
                """
                INSERT INTO document_chunk (id, document_id, revision, ordinal, text, chunk_config_id)
                VALUES (%s, %s, 1, 0, 'Previous content', %s)
                """,
                (old_chunk_id, queued_job.document_id, config_id),
            )
            # Duplicate ordinals cause a real database constraint failure after DELETE.
            def invalid_chunks(text: str, settings: ChunkingSettings) -> list[TextChunk]:
                return [TextChunk(0, "First"), TextChunk(0, "Second")]

            monkeypatch.setattr(ingestion_service, "chunk_text", invalid_chunks)
            with pytest.raises(UniqueViolation) as error:
                ingest_document(migrated_database_url, queued_job)
            assert error.value.diag.constraint_name == "document_chunk_document_revision_ordinal_idx"
            assert connection.execute(
                "SELECT status FROM document WHERE id = %s", (queued_job.document_id,)
            ).fetchone() == ("processing",)
            assert connection.execute(
                "SELECT id, text FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
            ).fetchall() == [(old_chunk_id, "Previous content")]
        finally:
            connection.execute("DELETE FROM document_chunk WHERE document_id = %s", (queued_job.document_id,))
            connection.execute("DELETE FROM chunk_config WHERE id = %s", (config_id,))


def test_processing_left_by_an_interrupted_worker_can_complete(
    migrated_database_url: str, queued_job: IngestionJobInput
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute("UPDATE document SET status = 'processing' WHERE id = %s", (queued_job.document_id,))
    assert ingest_document(migrated_database_url, queued_job) == "completed"


def test_oversized_source_records_safe_failure_without_chunks(
    migrated_database_url: str, queued_job: IngestionJobInput
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            "UPDATE document SET source_text = %s, size_bytes = 100001 WHERE id = %s",
            ("x" * 100_001, queued_job.document_id),
        )
        assert ingest_document(migrated_database_url, queued_job) == "failed"
        assert connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s", (queued_job.document_id,)
        ).fetchone() == ("failed", "Text must contain between 1 and 100,000 characters.")
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchone() == (0,)


@pytest.mark.parametrize("filename, expected_error", [
    ("three-pages.pdf", None),
    ("blank.pdf", "PDF contains no extractable text. OCR is not supported."),
    ("encrypted.pdf", "Encrypted PDFs are not supported."),
])
def test_pdf_source_selects_extraction_and_persists_pages_or_safe_failure(
    migrated_database_url: str, queued_job: IngestionJobInput,
    filename: str, expected_error: str | None, monkeypatch: pytest.MonkeyPatch,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            """UPDATE document SET source_type = 'pdf', source_text = NULL,
                   storage_key = 'private/source.pdf', mime_type = 'application/pdf',
                   original_filename = 'source.pdf'
               WHERE id = %s""", (queued_job.document_id,),
        )
        downloaded_keys: list[str] = []

        def process_pdf(storage_key: str, settings: ChunkingSettings) -> list[TextChunk]:
            downloaded_keys.append(storage_key)
            data = (Path(__file__).resolve().parents[2] / "fixtures" / "pdf" / filename).read_bytes()
            return chunk_pdf(data, settings)

        monkeypatch.setattr(ingestion_service, "process_pdf", process_pdf)
        expected_status = "failed" if expected_error else "completed"
        assert ingest_document(migrated_database_url, queued_job) == expected_status
        assert downloaded_keys == ["private/source.pdf"]
        assert connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == (expected_status, expected_error)
        rows = connection.execute(
            "SELECT ordinal, text, page_number, revision FROM document_chunk WHERE document_id = %s ORDER BY ordinal",
            (queued_job.document_id,),
        ).fetchall()
        assert rows == ([] if expected_error else [
            (0, "Alpha beta gamma delta", 1, 2), (1, "One two three four", 3, 2),
        ])
        assert ingest_document(migrated_database_url, queued_job) == "ignored"
        assert downloaded_keys == ["private/source.pdf"]


@pytest.mark.parametrize("change", [{"userId": "another-owner"}, {"revision": 1}])
def test_pdf_download_is_not_called_for_wrong_owner_or_stale_revision(
    migrated_database_url: str, queued_job: IngestionJobInput, change: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            """UPDATE document SET source_type = 'pdf', source_text = NULL,
                   storage_key = 'private/source.pdf', mime_type = 'application/pdf',
                   original_filename = 'source.pdf'
               WHERE id = %s""", (queued_job.document_id,),
        )
        payload = json.loads(queued_job.model_dump_json(by_alias=True))
        payload.update(change)
        job = parse_ingestion_job_input(json.dumps(payload).encode())

        def forbidden_download(storage_key: str, settings: ChunkingSettings) -> list[TextChunk]:
            pytest.fail("An unauthorized or stale job must not access object storage")

        monkeypatch.setattr(ingestion_service, "process_pdf", forbidden_download)
        assert ingest_document(migrated_database_url, job) == "ignored"
        assert connection.execute(
            "SELECT status FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == ("queued",)


def test_pdf_download_failure_remains_retryable(
    migrated_database_url: str, queued_job: IngestionJobInput, monkeypatch: pytest.MonkeyPatch,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            """UPDATE document SET source_type = 'pdf', source_text = NULL,
                   storage_key = 'private/source.pdf', mime_type = 'application/pdf',
                   original_filename = 'source.pdf'
               WHERE id = %s""", (queued_job.document_id,),
        )

        def unavailable_storage(storage_key: str, settings: ChunkingSettings) -> list[TextChunk]:
            raise PdfDownloadError("PDF download failed.")

        monkeypatch.setattr(ingestion_service, "process_pdf", unavailable_storage)
        with pytest.raises(PdfDownloadError):
            ingest_document(migrated_database_url, queued_job)
        assert connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == ("processing", None)
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,),
        ).fetchone() == (0,)
