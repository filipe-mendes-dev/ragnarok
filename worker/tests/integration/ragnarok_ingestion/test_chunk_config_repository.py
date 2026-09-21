from uuid import uuid4

from psycopg import Connection

from ragnarok_ingestion.chunk_config_repository import ChunkConfig, find_chunk_config


def test_reads_the_exact_stored_configuration(
    database: Connection[tuple[object, ...]],
) -> None:
    config_id = uuid4()
    database.execute(
        """
        INSERT INTO chunk_config (id, chunking_method, chunk_size, chunk_overlap)
        VALUES (%s, %s, %s, %s)
        """,
        (config_id, "recursive-character-v1", 800, 80),
    )

    assert find_chunk_config(database, config_id) == ChunkConfig(
        config_id, "recursive-character-v1", 800, 80
    )


def test_returns_none_for_a_missing_configuration(
    database: Connection[tuple[object, ...]],
) -> None:
    assert find_chunk_config(database, uuid4()) is None
