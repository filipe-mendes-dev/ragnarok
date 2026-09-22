"""RabbitMQ delivery and acknowledgements, separate from ingestion rules."""

import asyncio
import logging
import os
from time import perf_counter

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractQueue
from psycopg import OperationalError
from pydantic import ValidationError

from ragnarok_ingestion.diagnostics import safe_error_details
from ragnarok_ingestion.embedding import DocumentEmbedder
from ragnarok_ingestion.embedding_http import EmbeddingUnavailableError
from ragnarok_ingestion.ingestion_input import parse_ingestion_job_input
from ragnarok_ingestion.ingestion_service import DocumentBusyError, ingest_document

from ragnarok_ingestion.s3_source import PdfDownloadError

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


async def consume_ingestion(
    rabbitmq_url: str, database_url: str, embedder: DocumentEmbedder,
) -> None:
    # Fail visibly on connection loss. Restarting permits redelivery of unacked work.
    logger.info("event=broker_connecting")
    connection = await aio_pika.connect(rabbitmq_url, timeout=10, heartbeat=30)
    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1, timeout=10)
        logger.info("event=queue_declaring")
        queue = await declare_ingestion_queue(channel)
        logger.info("event=worker_ready")
        async with queue.iterator() as messages:
            async for message in messages:
                try:
                    job = parse_ingestion_job_input(message.body)
                except ValidationError:
                    # Never print the body or validation error: they may contain secrets.
                    await message.reject(requeue=False)
                    logger.warning("event=message_rejected reason=invalid_input")
                    continue

                started = perf_counter()
                logger.info("event=job_received document=%s revision=%s redelivered=%s",
                            job.document_id, job.revision, message.redelivered)
                for attempt in range(3):
                    logger.info("event=job_attempt document=%s revision=%s attempt=%s",
                                job.document_id, job.revision, attempt + 1)
                    try:
                        # Database work and embedding HTTP calls are synchronous. A thread keeps
                        # their work from blocking RabbitMQ heartbeats in this loop.
                        outcome = await asyncio.to_thread(ingest_document, database_url, job, embedder)
                        break
                    except (OperationalError, DocumentBusyError, PdfDownloadError, EmbeddingUnavailableError) as error:
                        logger.warning("event=job_attempt_failed document=%s revision=%s attempt=%s error=%s",
                                       job.document_id, job.revision, attempt + 1, safe_error_details(error))
                        if attempt == 2:
                            # Exit without acknowledging. Closing the connection
                            # returns the delivery to RabbitMQ for a later restart.
                            raise
                        logger.info("event=job_retry document=%s revision=%s delay_seconds=%s",
                                    job.document_id, job.revision, 2 ** attempt)
                        await asyncio.sleep(2 ** attempt)
                    except Exception as error:
                        logger.error("event=job_failed document=%s revision=%s error=%s",
                                     job.document_id, job.revision, safe_error_details(error))
                        raise

                logger.info("event=job_acknowledging document=%s revision=%s outcome=%s",
                            job.document_id, job.revision, outcome)
                await message.ack()
                logger.info(
                    "event=job_finished document=%s revision=%s outcome=%s duration_ms=%s",
                    job.document_id, job.revision, outcome, round((perf_counter() - started) * 1000),
                )
