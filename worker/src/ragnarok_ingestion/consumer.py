"""RabbitMQ delivery and acknowledgements, separate from ingestion rules."""

import asyncio
import logging
import os

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractQueue
from psycopg import OperationalError
from pydantic import ValidationError

from ragnarok_ingestion.ingestion_input import parse_ingestion_job_input
from ragnarok_ingestion.ingestion_service import DocumentBusyError, ingest_document

logger = logging.getLogger(__name__)


async def declare_ingestion_queue(channel: AbstractChannel) -> AbstractQueue:
    queue_name = os.environ.get("INGESTION_QUEUE_NAME", "")
    rejected_queue_name = os.environ.get("INGESTION_REJECTED_QUEUE_NAME", "")
    if not queue_name.strip() or not rejected_queue_name.strip() or queue_name == rejected_queue_name:
        raise ValueError("Set distinct, nonblank INGESTION_QUEUE_NAME and INGESTION_REJECTED_QUEUE_NAME")
    await channel.declare_queue(rejected_queue_name, durable=True, timeout=10)
    return await channel.declare_queue(
        queue_name,
        durable=True,
        arguments={
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": rejected_queue_name,
        },
        timeout=10,
    )


async def consume_ingestion(rabbitmq_url: str, database_url: str) -> None:
    # Fail visibly on connection loss. Restarting permits redelivery of unacked work.
    connection = await aio_pika.connect(rabbitmq_url, timeout=10, heartbeat=30)
    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1, timeout=10)
        queue = await declare_ingestion_queue(channel)
        logger.info("Waiting for ingestion messages")
        async with queue.iterator() as messages:
            async for message in messages:
                try:
                    job = parse_ingestion_job_input(message.body)
                except ValidationError:
                    # Never print the body or validation error: they may contain secrets.
                    await message.reject(requeue=False)
                    logger.warning("Rejected invalid ingestion message")
                    continue

                for attempt in range(3):
                    try:
                        # Psycopg and the splitter are synchronous. A thread keeps
                        # their work from blocking RabbitMQ heartbeats in this loop.
                        outcome = await asyncio.to_thread(ingest_document, database_url, job)
                        break
                    except (OperationalError, DocumentBusyError):
                        if attempt == 2:
                            # Exit without acknowledging. Closing the connection
                            # returns the delivery to RabbitMQ for a later restart.
                            raise
                        await asyncio.sleep(2 ** attempt)

                await message.ack()
                logger.info(
                    "document=%s revision=%s outcome=%s",
                    job.document_id, job.revision, outcome,
                )
