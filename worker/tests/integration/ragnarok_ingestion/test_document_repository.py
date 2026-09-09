from uuid import uuid4

from psycopg import Connection
import pytest

from ragnarok_ingestion.document_repository import (
    TextDocumentSource,
    find_text_source_for_user,
)


@pytest.fixture
def text_source(database: Connection[tuple[object, ...]]) -> TextDocumentSource:
    owner_id = "document-owner"
    document_id = uuid4()
    database.execute(
        'INSERT INTO "user" (id, name, email) VALUES (%s, %s, %s)',
        (owner_id, "Document owner", "owner@example.test"),
    )
    database.execute(
        """
        INSERT INTO document
            (id, user_id, title, source_type, source_text, mime_type, size_bytes, revision)
        VALUES (%s, %s, %s, 'text', %s, 'text/plain', %s, 2)
        """,
        (document_id, owner_id, "Notes", "Private source text", 19),
    )
    return TextDocumentSource(document_id, 2, "Private source text", "uploaded")


def test_reads_the_owners_requested_revision(
    database: Connection[tuple[object, ...]], text_source: TextDocumentSource
) -> None:
    result = find_text_source_for_user(database, "document-owner", text_source.id, 2)
    assert result == text_source


@pytest.mark.parametrize("user_id", ["another-user", "document-owner' OR TRUE --"])
def test_does_not_expose_another_users_source(
    database: Connection[tuple[object, ...]],
    text_source: TextDocumentSource,
    user_id: str,
) -> None:
    assert find_text_source_for_user(database, user_id, text_source.id, 2) is None


def test_does_not_return_a_newer_source_to_a_stale_job(
    database: Connection[tuple[object, ...]], text_source: TextDocumentSource
) -> None:
    assert find_text_source_for_user(database, "document-owner", text_source.id, 1) is None


def test_returns_none_for_a_missing_document(
    database: Connection[tuple[object, ...]],
) -> None:
    assert find_text_source_for_user(database, "document-owner", uuid4(), 1) is None


def test_does_not_treat_a_pdf_as_a_text_source(
    database: Connection[tuple[object, ...]], text_source: TextDocumentSource
) -> None:
    database.execute(
        """
        UPDATE document SET source_type = 'pdf', source_text = NULL,
            storage_key = 'test/source.pdf', original_filename = 'source.pdf',
            mime_type = 'application/pdf'
        WHERE id = %s
        """,
        (text_source.id,),
    )
    assert find_text_source_for_user(database, "document-owner", text_source.id, 2) is None
