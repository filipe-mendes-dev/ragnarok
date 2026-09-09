"""Document reads required by text ingestion."""

from dataclasses import dataclass
from uuid import UUID

from psycopg import Connection
from psycopg.rows import class_row


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
