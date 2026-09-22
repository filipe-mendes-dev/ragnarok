from collections.abc import Iterator
import json
import logging
from pathlib import Path
from uuid import uuid4

import pytest
from psycopg.errors import UniqueViolation
from tokenizers import Tokenizer

from ragnarok_ingestion import ingestion_service
from ragnarok_ingestion.pdf_extraction import ExtractedPage, extract_pdf_pages
from ragnarok_ingestion.s3_source import PdfDownloadError
from ragnarok_ingestion.chunking import TextChunk
from ragnarok_ingestion.embedding import (
    MODEL_NAME, MODEL_REVISION, TOKEN_CHUNKING_METHOD,
    EmbeddingInputError, LocalEmbedder, chunk_for_embedding, count_input_tokens,
)
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
    migrated_database_url: str, queued_job: IngestionJobInput, embedder: LocalEmbedder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected_vector = [1.0] + [0.0] * 383
    embedded_texts: list[str] = []

    def embed_known_vector(model: LocalEmbedder, texts: list[str]) -> list[list[float]]:
        embedded_texts.extend(texts)
        return [expected_vector for text in texts]

    monkeypatch.setattr(ingestion_service, "embed_documents", embed_known_vector)
    assert ingest_document(migrated_database_url, queued_job, embedder) == "completed"
    with connect_database(migrated_database_url) as connection:
        row = connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s",
            (queued_job.document_id,),
        ).fetchone()
        assert row == ("completed", None)
        chunks = connection.execute(
            """
            SELECT c.id, c.revision, c.ordinal, c.text, c.page_number,
                   config.chunking_method, config.chunk_size, config.chunk_overlap,
                   c.embedding::text, c.embedding_model, c.embedding_revision
            FROM document_chunk c JOIN chunk_config config ON config.id = c.chunk_config_id
            WHERE c.document_id = %s ORDER BY c.ordinal
            """,
            (queued_job.document_id,),
        ).fetchall()
        assert len(chunks) == 1
        assert chunks[0][1:8] == (2, 0, "Private source text", None, TOKEN_CHUNKING_METHOD, 384, 48)
        assert json.loads(str(chunks[0][8])) == expected_vector
        assert chunks[0][9:] == (MODEL_NAME, MODEL_REVISION)
        assert ingest_document(migrated_database_url, queued_job, embedder) == "ignored"
        assert embedded_texts == ["Private source text"]
        assert connection.execute(
            "SELECT id FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchall() == [(chunks[0][0],)]


@pytest.mark.parametrize("change", [{"userId": "another-owner"}, {"revision": 1}])
def test_wrong_owner_or_revision_cannot_change_document(
    migrated_database_url: str, queued_job: IngestionJobInput, change: dict[str, object],
    embedder: LocalEmbedder,
) -> None:
    payload = json.loads(queued_job.model_dump_json(by_alias=True))
    payload.update(change)
    job = parse_ingestion_job_input(json.dumps(payload).encode())
    assert ingest_document(migrated_database_url, job, embedder) == "ignored"
    with connect_database(migrated_database_url) as connection:
        assert connection.execute(
            "SELECT status FROM document WHERE id = %s", (queued_job.document_id,)
        ).fetchone() == ("queued",)
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchone() == (0,)


def test_connection_lock_prevents_concurrent_processing_and_is_released_on_close(
    migrated_database_url: str, queued_job: IngestionJobInput, embedder: LocalEmbedder,
) -> None:
    with connect_database(migrated_database_url) as connection:
        assert try_lock_document(connection, queued_job.document_id)
        with pytest.raises(DocumentBusyError):
            ingest_document(migrated_database_url, queued_job, embedder)
    assert ingest_document(migrated_database_url, queued_job, embedder) == "completed"


def test_edit_during_chunking_prevents_stale_completion(
    migrated_database_url: str, queued_job: IngestionJobInput, monkeypatch: pytest.MonkeyPatch,
    embedder: LocalEmbedder,
) -> None:
    def chunk_with_concurrent_edit(text: str, tokenizer: Tokenizer) -> list[TextChunk]:
        with connect_database(migrated_database_url) as connection:
            connection.execute(
                "UPDATE document SET revision = 3, source_text = 'New source', status = 'queued' WHERE id = %s",
                (queued_job.document_id,),
            )
        return chunk_for_embedding(text, tokenizer)

    monkeypatch.setattr(ingestion_service, "chunk_for_embedding", chunk_with_concurrent_edit)
    assert ingest_document(migrated_database_url, queued_job, embedder) == "ignored"
    with connect_database(migrated_database_url) as connection:
        assert connection.execute(
            "SELECT revision, status FROM document WHERE id = %s", (queued_job.document_id,)
        ).fetchone() == (3, "queued")
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
        ).fetchone() == (0,)


@pytest.mark.parametrize("failure_stage", ["embedding", "persistence"])
def test_failure_preserves_old_chunks_and_embeddings_without_completing(
    migrated_database_url: str, queued_job: IngestionJobInput, monkeypatch: pytest.MonkeyPatch,
    embedder: LocalEmbedder,
    failure_stage: str,
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
                INSERT INTO document_chunk (id, document_id, revision, ordinal, text, chunk_config_id,
                                            embedding, embedding_model, embedding_revision)
                VALUES (%s, %s, 1, 0, 'Previous content', %s, %s::vector, %s, %s)
                """,
                (old_chunk_id, queued_job.document_id, config_id,
                 json.dumps([1.0] + [0.0] * 383), MODEL_NAME, MODEL_REVISION),
            )
            # Duplicate ordinals cause a real database constraint failure after DELETE.
            def invalid_chunks(text: str, tokenizer: Tokenizer) -> list[TextChunk]:
                return [TextChunk(0, "First"), TextChunk(0, "Second")]

            monkeypatch.setattr(ingestion_service, "chunk_for_embedding", invalid_chunks)
            if failure_stage == "embedding":
                def fail_embedding(model: LocalEmbedder, texts: list[str]) -> list[list[float]]:
                    raise RuntimeError("Simulated inference failure")

                monkeypatch.setattr(ingestion_service, "embed_documents", fail_embedding)
            expected_error = RuntimeError if failure_stage == "embedding" else UniqueViolation
            with pytest.raises(expected_error) as error:
                ingest_document(migrated_database_url, queued_job, embedder)
            if isinstance(error.value, UniqueViolation):
                assert error.value.diag.constraint_name == "document_chunk_document_revision_ordinal_idx"
            assert connection.execute(
                "SELECT status FROM document WHERE id = %s", (queued_job.document_id,)
            ).fetchone() == ("processing",)
            assert connection.execute(
                "SELECT id, text FROM document_chunk WHERE document_id = %s", (queued_job.document_id,)
            ).fetchall() == [(old_chunk_id, "Previous content")]
            saved = connection.execute(
                "SELECT embedding::text, embedding_model, embedding_revision FROM document_chunk WHERE id = %s",
                (old_chunk_id,),
            ).fetchone()
            assert saved is not None
            assert json.loads(str(saved[0])) == [1.0] + [0.0] * 383
            assert saved[1:] == (MODEL_NAME, MODEL_REVISION)
        finally:
            connection.execute("DELETE FROM document_chunk WHERE document_id = %s", (queued_job.document_id,))
            connection.execute("DELETE FROM chunk_config WHERE id = %s", (config_id,))


def test_processing_left_by_an_interrupted_worker_can_complete(
    migrated_database_url: str, queued_job: IngestionJobInput, embedder: LocalEmbedder,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute("UPDATE document SET status = 'processing' WHERE id = %s", (queued_job.document_id,))
    assert ingest_document(migrated_database_url, queued_job, embedder) == "completed"


def test_edit_during_embedding_discards_stale_vectors(
    migrated_database_url: str, queued_job: IngestionJobInput,
    embedder: LocalEmbedder, monkeypatch: pytest.MonkeyPatch,
) -> None:
    def embed_with_concurrent_edit(model: LocalEmbedder, texts: list[str]) -> list[list[float]]:
        with connect_database(migrated_database_url) as connection:
            connection.execute(
                "UPDATE document SET revision = 3, source_text = 'New source', status = 'queued' WHERE id = %s",
                (queued_job.document_id,),
            )
        return [[1.0] + [0.0] * 383 for text in texts]

    monkeypatch.setattr(ingestion_service, "embed_documents", embed_with_concurrent_edit)
    assert ingest_document(migrated_database_url, queued_job, embedder) == "ignored"
    with connect_database(migrated_database_url) as connection:
        assert connection.execute(
            "SELECT revision, status FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == (3, "queued")
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,),
        ).fetchone() == (0,)


def test_token_limit_rejection_records_safe_failure_without_partial_chunks(
    migrated_database_url: str, queued_job: IngestionJobInput,
    embedder: LocalEmbedder, monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject_input(model: LocalEmbedder, texts: list[str]) -> list[list[float]]:
        raise EmbeddingInputError("Chunk exceeds the 384-content-token budget")

    monkeypatch.setattr(ingestion_service, "embed_documents", reject_input)
    assert ingest_document(migrated_database_url, queued_job, embedder) == "failed"
    with connect_database(migrated_database_url) as connection:
        assert connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == ("failed", "Chunk exceeds the 384-content-token budget")
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,),
        ).fetchone() == (0,)


def test_long_text_is_token_chunked_and_every_chunk_has_a_vector(
    migrated_database_url: str, queued_job: IngestionJobInput, embedder: LocalEmbedder,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            "UPDATE document SET source_text = %s, size_bytes = 9000 WHERE id = %s",
            ("document " * 1000, queued_job.document_id),
        )
        assert ingest_document(migrated_database_url, queued_job, embedder) == "completed"
        rows = connection.execute(
            "SELECT text, vector_dims(embedding) FROM document_chunk WHERE document_id = %s ORDER BY ordinal",
            (queued_job.document_id,),
        ).fetchall()
        assert len(rows) >= 3
        assert any(len(str(row[0])) > 1000 for row in rows)
        assert all(count_input_tokens(embedder.tokenizer, str(row[0])) <= 386 for row in rows)
        assert all(row[1] == 384 for row in rows)


def test_oversized_source_records_safe_failure_without_chunks(
    migrated_database_url: str, queued_job: IngestionJobInput, embedder: LocalEmbedder,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            "UPDATE document SET source_text = %s, size_bytes = 100001 WHERE id = %s",
            ("x" * 100_001, queued_job.document_id),
        )
        assert ingest_document(migrated_database_url, queued_job, embedder) == "failed"
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
    embedder: LocalEmbedder,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            """UPDATE document SET source_type = 'pdf', source_text = NULL,
                   storage_key = 'private/source.pdf', mime_type = 'application/pdf',
                   original_filename = 'source.pdf'
               WHERE id = %s""", (queued_job.document_id,),
        )
        downloaded_keys: list[str] = []

        def process_pdf(storage_key: str) -> list[ExtractedPage]:
            downloaded_keys.append(storage_key)
            data = (Path(__file__).resolve().parents[2] / "fixtures" / "pdf" / filename).read_bytes()
            return extract_pdf_pages(data)

        monkeypatch.setattr(ingestion_service, "process_pdf", process_pdf)
        expected_status = "failed" if expected_error else "completed"
        caplog.set_level(logging.INFO, logger="ragnarok_ingestion.ingestion_service")
        assert ingest_document(migrated_database_url, queued_job, embedder) == expected_status
        assert downloaded_keys == ["private/source.pdf"]
        if expected_error is not None:
            assert "stage=pdf_processing" in caplog.text
            assert f"reason={json.dumps(expected_error)}" in caplog.text
        else:
            assert "event=pdf_extracted" in caplog.text
            assert "completed_chunks=2 total_chunks=2" in caplog.text
        assert "private/source.pdf" not in caplog.text
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
        assert ingest_document(migrated_database_url, queued_job, embedder) == "ignored"
        assert downloaded_keys == ["private/source.pdf"]


@pytest.mark.parametrize("change", [{"userId": "another-owner"}, {"revision": 1}])
def test_pdf_download_is_not_called_for_wrong_owner_or_stale_revision(
    migrated_database_url: str, queued_job: IngestionJobInput, change: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    embedder: LocalEmbedder,
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

        def forbidden_download(storage_key: str) -> list[ExtractedPage]:
            pytest.fail("An unauthorized or stale job must not access object storage")

        monkeypatch.setattr(ingestion_service, "process_pdf", forbidden_download)
        assert ingest_document(migrated_database_url, job, embedder) == "ignored"
        assert connection.execute(
            "SELECT status FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == ("queued",)


def test_pdf_download_failure_remains_retryable(
    migrated_database_url: str, queued_job: IngestionJobInput, monkeypatch: pytest.MonkeyPatch,
    embedder: LocalEmbedder,
) -> None:
    with connect_database(migrated_database_url) as connection:
        connection.execute(
            """UPDATE document SET source_type = 'pdf', source_text = NULL,
                   storage_key = 'private/source.pdf', mime_type = 'application/pdf',
                   original_filename = 'source.pdf'
               WHERE id = %s""", (queued_job.document_id,),
        )

        def unavailable_storage(storage_key: str) -> list[ExtractedPage]:
            raise PdfDownloadError("PDF download failed.")

        monkeypatch.setattr(ingestion_service, "process_pdf", unavailable_storage)
        with pytest.raises(PdfDownloadError):
            ingest_document(migrated_database_url, queued_job, embedder)
        assert connection.execute(
            "SELECT status, processing_error FROM document WHERE id = %s", (queued_job.document_id,),
        ).fetchone() == ("processing", None)
        assert connection.execute(
            "SELECT count(*) FROM document_chunk WHERE document_id = %s", (queued_job.document_id,),
        ).fetchone() == (0,)
