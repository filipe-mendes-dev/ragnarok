"""Chunk writes; the ingestion service owns their transaction."""

from uuid import UUID
import json

from psycopg import Connection

from ragnarok_ingestion.chunking import TextChunk


def replace_document_chunks(
    connection: Connection[tuple[object, ...]],
    document_id: UUID,
    user_id: str,
    revision: int,
    config_id: UUID,
    chunks: list[TextChunk],
    embeddings: list[list[float]],
    embedding_model: str,
    embedding_revision: str,
) -> None:
    """Call only after locking the matching owned document in a transaction."""
    rows = [
        (chunk.ordinal, chunk.text, chunk.page_number, config_id,
         json.dumps(vector, allow_nan=False), embedding_model, embedding_revision,
         document_id, user_id, revision)
        for chunk, vector in zip(chunks, embeddings, strict=True)
    ]
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
                (document_id, revision, ordinal, text, page_number, chunk_config_id,
                 embedding, embedding_model, embedding_revision)
            SELECT id, revision, %s, %s, %s, %s, %s::vector, %s, %s FROM document
            WHERE id = %s AND user_id = %s AND revision = %s
            """,
            rows,
        )
