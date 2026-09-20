"""Chunk writes; the ingestion service owns their transaction."""

from uuid import UUID

from psycopg import Connection

from ragnarok_ingestion.chunking import TextChunk


def replace_document_chunks(
    connection: Connection[tuple[object, ...]],
    document_id: UUID,
    user_id: str,
    revision: int,
    config_id: UUID,
    chunks: list[TextChunk],
) -> None:
    """Call only after locking the matching owned document in a transaction."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            DELETE FROM document_chunk AS chunk USING document AS source
            WHERE chunk.document_id = source.id
              AND source.id = %s AND source.user_id = %s AND source.revision = %s
            """,
            (document_id, user_id, revision),
        )
        cursor.executemany(
            """
            INSERT INTO document_chunk
                (document_id, revision, ordinal, text, page_number, chunk_config_id)
            SELECT id, revision, %s, %s, %s, %s FROM document
            WHERE id = %s AND user_id = %s AND revision = %s
            """,
            [
                (chunk.ordinal, chunk.text, chunk.page_number, config_id, document_id, user_id, revision)
                for chunk in chunks
            ],
        )
