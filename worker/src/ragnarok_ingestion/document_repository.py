"""Document reads required by text ingestion."""

from dataclasses import dataclass
from uuid import UUID

from psycopg import Connection
from psycopg.rows import class_row


def try_lock_document(
    connection: Connection[tuple[object, ...]], document_id: UUID
) -> bool:
    """Hold a session advisory lock until this dedicated connection closes."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_try_advisory_lock(hashtextextended(%s, 0))",
            (f"ingestion:{document_id}",),
        )
        row = cursor.fetchone()
        return row is not None and row[0] is True


@dataclass(frozen=True)
class TextDocumentSource:
    id: UUID
    revision: int
    source_text: str
    status: str


def find_text_source_for_user(
    connection: Connection[tuple[object, ...]],
    user_id: str,
    document_id: UUID,
    revision: int,
) -> TextDocumentSource | None:
    """Return only the owner's matching text revision, or None.

    This read does not claim processing ownership or change document status.
    """
    with connection.cursor(row_factory=class_row(TextDocumentSource)) as cursor:
        cursor.execute(
            """
            SELECT id, revision, source_text, status
            FROM document
            WHERE id = %s AND user_id = %s AND revision = %s
              AND source_type = 'text' AND source_text IS NOT NULL
            """,
            (document_id, user_id, revision),
        )
        return cursor.fetchone()


def update_text_status_for_user(
    connection: Connection[tuple[object, ...]],
    user_id: str,
    document_id: UUID,
    revision: int,
    expected_statuses: list[str],
    status: str,
    error: str | None = None,
) -> TextDocumentSource | None:
    """The caller selects permitted transitions and owns the transaction.

    UPDATE locks the row until commit, so a source edit cannot interleave with
    chunk replacement in the same transaction.
    """
    with connection.cursor(row_factory=class_row(TextDocumentSource)) as cursor:
        cursor.execute(
            """
            UPDATE document
            SET status = %s, processing_error = %s, updated_at = now()
            WHERE id = %s AND user_id = %s AND revision = %s
              AND source_type = 'text' AND source_text IS NOT NULL
              AND status::text = ANY(%s)
            RETURNING id, revision, source_text, status
            """,
            (status, error, document_id, user_id, revision, expected_statuses),
        )
        return cursor.fetchone()
