"""Run with uv run --env-file ../.env python -m ragnarok_ingestion."""

import asyncio
import logging
import os
from pathlib import Path

from ragnarok_ingestion.consumer import consume_ingestion
from ragnarok_ingestion.diagnostics import safe_error_details
from ragnarok_ingestion.embedding import DEFAULT_MODEL_DIRECTORY
from ragnarok_ingestion.embedding_http import load_remote_embedder


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        database_url = os.environ["DATABASE_URL"]
        rabbitmq_url = os.environ["RABBITMQ_URL"]
    except KeyError:
        raise SystemExit("Set DATABASE_URL and RABBITMQ_URL before starting the worker") from None

    try:
        model_directory = Path(os.environ.get("EMBEDDING_MODEL_DIR", str(DEFAULT_MODEL_DIRECTORY)))
        logging.info("event=embedding_client_loading")
        embedder = load_remote_embedder(model_directory)
        logging.info("event=embedding_client_ready")
        asyncio.run(consume_ingestion(rabbitmq_url, database_url, embedder))
    except KeyboardInterrupt:
        logging.info("Worker stopped")
    except Exception as error:
        # Driver exceptions can include connection credentials or source values.
        logging.error("event=worker_stopped error=%s unacknowledged_work=redeliverable", safe_error_details(error))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
