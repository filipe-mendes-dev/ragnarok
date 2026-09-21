"""Document reads and status updates required by ingestion."""

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
class DocumentSource:
    id: UUID
    revision: int
    source_type: str
    source_text: str | None
    storage_key: str | None
    status: str


def update_status_for_user(
    connection: Connection[tuple[object, ...]],
    user_id: str,
    document_id: UUID,
    revision: int,
    expected_statuses: list[str],
    status: str,
    error: str | None = None,
) -> DocumentSource | None:
    """The caller selects permitted transitions and owns the transaction.

    UPDATE locks the row until commit, so a source edit cannot interleave with
    chunk replacement in the same transaction.
    """
    with connection.cursor(row_factory=class_row(DocumentSource)) as cursor:
        cursor.execute(
            """
            UPDATE document
            SET status = %s, processing_error = %s, updated_at = now()
            WHERE id = %s AND user_id = %s AND revision = %s
              AND source_type IN ('text', 'pdf')
              AND status::text = ANY(%s)
            RETURNING id, revision, source_type, source_text, storage_key, status
            """,
            (status, error, document_id, user_id, revision, expected_statuses),
        )
        return cursor.fetchone()
