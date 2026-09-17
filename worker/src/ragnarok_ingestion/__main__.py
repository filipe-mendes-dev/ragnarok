"""Run with uv run --env-file ../.env python -m ragnarok_ingestion."""

import asyncio
import logging
import os

from ragnarok_ingestion.consumer import consume_ingestion


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        database_url = os.environ["DATABASE_URL"]
        rabbitmq_url = os.environ["RABBITMQ_URL"]
    except KeyError:
        raise SystemExit("Set DATABASE_URL and RABBITMQ_URL before starting the worker") from None

    try:
        asyncio.run(consume_ingestion(rabbitmq_url, database_url))
    except KeyboardInterrupt:
        logging.info("Worker stopped")
    except Exception:
        # Driver exceptions can include connection credentials or source values.
        logging.error("Worker stopped after an infrastructure or processing error; unacknowledged work can be redelivered")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
