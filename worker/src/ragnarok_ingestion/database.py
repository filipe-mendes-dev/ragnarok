"""PostgreSQL connections shared by the worker's repositories."""

import psycopg
from psycopg import Connection


def connect_database(database_url: str) -> Connection[tuple[object, ...]]:
    """Open a bounded connection; callers close it with a `with` block.

    Autocommit avoids leaving a read-only query in an open transaction. Services
    will use connection.transaction() explicitly for multi-query writes.
    """
    return psycopg.connect(
        database_url,
        autocommit=True,
        connect_timeout=5,
        options="-c statement_timeout=10000 -c lock_timeout=3000",
    )
