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
