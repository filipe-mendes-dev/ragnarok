"""Exercise actual AMQP delivery against a disposable broker and database."""

import asyncio
from contextlib import suppress
import json
from uuid import uuid4

import pytest
import aio_pika
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

from ragnarok_ingestion.consumer import (
    consume_ingestion,
    declare_ingestion_queue,
)
from ragnarok_ingestion.database import connect_database
from ragnarok_ingestion.embedding import LocalEmbedder


def test_worker_persists_real_delivery_and_rejects_invalid_json(
    migrated_database_url: str,
    embedder: LocalEmbedder,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INGESTION_QUEUE_NAME", "test.ingestion")
    monkeypatch.setenv("INGESTION_REJECTED_QUEUE_NAME", "test.rejected")
    owner_id = str(uuid4())
    document_id = uuid4()
    with connect_database(migrated_database_url) as database:
        database.execute(
            'INSERT INTO "user" (id, name, email) VALUES (%s, %s, %s)',
            (owner_id, "Broker test owner", f"{owner_id}@example.test"),
        )
        try:
            database.execute(
                """
                INSERT INTO document (id, user_id, title, source_type, source_text,
                                      mime_type, size_bytes, status)
                VALUES (%s, %s, 'Notes', 'text', 'RabbitMQ text', 'text/plain', 13, 'queued')
                """,
                (document_id, owner_id),
            )
            with (
                DockerContainer("rabbitmq:4-management")
                .with_env("RABBITMQ_DEFAULT_USER", "test")
                .with_env("RABBITMQ_DEFAULT_PASS", "test")
                .with_exposed_ports(5672)
                .waiting_for(LogMessageWaitStrategy("Server startup complete"))
            ) as rabbitmq:
                url = f"amqp://test:test@{rabbitmq.get_container_host_ip()}:{rabbitmq.get_exposed_port(5672)}/"

                async def exercise_delivery() -> None:
                    connection = await aio_pika.connect(url, timeout=10)
                    async with connection:
                        channel = await connection.channel(publisher_confirms=True)
                        queue = await declare_ingestion_queue(channel)
                        body = json.dumps({
                            "version": 1, "documentId": str(document_id),
                            "revision": 1, "userId": owner_id,
                        }).encode()
                        # Publication happens before consumption, proving the queue retains it.
                        for payload in [body, body, b"invalid-json"]:
                            await channel.default_exchange.publish(
                                aio_pika.Message(payload, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
                                routing_key=queue.name, mandatory=True, timeout=10,
                            )
                        worker = asyncio.create_task(consume_ingestion(url, migrated_database_url, embedder))
                        try:
                            rejected_queue = await channel.get_queue("test.rejected")
                            async with asyncio.timeout(20):
                                async with rejected_queue.iterator() as rejected:
                                    async for message in rejected:
                                        assert message.body == b"invalid-json"
                                        await message.ack()
                                        break
                            # One-at-a-time delivery means both valid messages finished first.
                            assert database.execute(
                                "SELECT status FROM document WHERE id = %s", (document_id,)
                            ).fetchone() == ("completed",)
                            assert database.execute(
                                "SELECT ordinal, text FROM document_chunk WHERE document_id = %s",
                                (document_id,),
                            ).fetchall() == [(0, "RabbitMQ text")]
                        finally:
                            worker.cancel()
                            with suppress(asyncio.CancelledError):
                                await worker

                asyncio.run(exercise_delivery())
        finally:
            database.execute('DELETE FROM "user" WHERE id = %s', (owner_id,))
