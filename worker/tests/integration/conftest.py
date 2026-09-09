"""Disposable PostgreSQL with the repository's Drizzle migrations."""

from collections.abc import Iterator
import os
from pathlib import Path
import subprocess

import pytest
from psycopg import Connection
from testcontainers.postgres import PostgresContainer

from ragnarok_ingestion.database import connect_database

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def migrated_database_url() -> Iterator[str]:
    """Share the expensive container, but never share mutable test rows."""
    with PostgresContainer(
        "pgvector/pgvector:0.8.6-pg18-bookworm",
        driver="psycopg",
        username="ragnarok_test",
        password="ragnarok_test",
        dbname="ragnarok_test",
    ) as postgres:
        database_url = postgres.get_connection_url().replace(
            "postgresql+psycopg://", "postgresql://", 1
        )
        subprocess.run(
            ["npm", "run", "db:migrate"],
            cwd=REPOSITORY_ROOT,
            env={**os.environ, "DATABASE_URL": database_url},
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        yield database_url


@pytest.fixture
def database(migrated_database_url: str) -> Iterator[Connection[tuple[object, ...]]]:
    """Each test's direct seed writes are rolled back after its assertions."""
    with connect_database(migrated_database_url) as connection:
        with connection.transaction(force_rollback=True):
            yield connection
