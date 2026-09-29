"""Read reusable chunk settings without modifying their history."""

from dataclasses import dataclass
from uuid import UUID

from psycopg import Connection
from psycopg.rows import class_row


@dataclass(frozen=True)
class ChunkConfig:
    id: UUID
    chunking_method: str
    chunk_size: int
    chunk_overlap: int


def find_chunk_config(
    connection: Connection[tuple[object, ...]],
    config_id: UUID,
) -> ChunkConfig | None:
    """Configurations contain no private source data and are shared globally."""
    with connection.cursor(row_factory=class_row(ChunkConfig)) as cursor:
        cursor.execute(
            """
            SELECT id, chunking_method, chunk_size, chunk_overlap
            FROM chunk_config
            WHERE id = %s
            """,
            (config_id,),
        )
        return cursor.fetchone()


def insert_chunk_config_if_missing(
    connection: Connection[tuple[object, ...]],
    method: str,
    size: int,
    overlap: int,
) -> UUID:
    """Reuse an immutable configuration without updating an existing row."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO chunk_config (chunking_method, chunk_size, chunk_overlap)
            VALUES (%s, %s, %s)
            ON CONFLICT (chunking_method, chunk_size, chunk_overlap) DO NOTHING
            """,
            (method, size, overlap),
        )
        cursor.execute(
            """
            SELECT id FROM chunk_config
            WHERE chunking_method = %s AND chunk_size = %s AND chunk_overlap = %s
            """,
            (method, size, overlap),
        )
        row = cursor.fetchone()
        if row is None or not isinstance(row[0], UUID):
            raise RuntimeError("Chunk configuration was not persisted")
        return row[0]
