# Python ingestion worker

The worker consumes RabbitMQ messages and ingests queued text documents. It loads
an owned revision from PostgreSQL, splits it with LangChain, and saves its chunks.
PDF extraction and automatic publication from Next.js are not implemented yet.
This is the first text-worker step, not the completed Phase 4 pipeline.

## Install and run

From `worker`, update the environment and uv-generated lockfile:

```bash
uv sync
```

`pyproject.toml` now declares `aio-pika` and Pydantic directly. aio-pika speaks the
RabbitMQ protocol and handles connection I/O. Pydantic validates incoming JSON,
like Zod in TypeScript. Neither the standard library nor Psycopg provides an AMQP
client. uv owns `uv.lock`; do not edit it manually.

Copy the RabbitMQ variables from the root `.env.example` to your existing `.env`.
Do not replace your existing environment file. From the repository root, run:

```bash
docker compose -f compose.dev.yml up -d rabbitmq
docker compose -f compose.dev.yml ps rabbitmq
```

RabbitMQ's dashboard is at http://localhost:15672. Its default local credentials
are `ragnarok` and `ragnarok_dev_password`. Port 5672 is for application connections;
15672 is for the dashboard. Both bind only to localhost. The named volume preserves
broker data across ordinary container restarts. The hostname keeps RabbitMQ's node
identity stable. This development image follows the RabbitMQ 4 major series.

From `worker`, start the consumer:

```bash
uv run --env-file ../.env python -m ragnarok_ingestion
```

uv loads the root environment and runs the installed Python package. Python calls
its `__main__.py`. The worker stays running until interrupted or an unrecovered
error occurs. No HTTP server is involved. It declares the durable queues
`ragnarok.ingestion.v1` and `ragnarok.ingestion.rejected.v1`.

Starting the worker does not enqueue existing documents. Next.js publication is
the next step. The broker integration test seeds a queued text document and sends
a real message, so we can verify this worker before connecting uploads.

## Follow one message through the files

1. `__main__.py` reads `DATABASE_URL` and `RABBITMQ_URL`, configures logging, and
   starts the consumer. It contains no ingestion workflow. Missing variables
   produce a short startup error.
2. `consumer.py` connects to RabbitMQ and asks for one unacknowledged message at a
   time with `prefetch_count=1`. It validates the message, calls the service, then
   acknowledges the delivery. An acknowledgement tells RabbitMQ it can remove that
   delivery. It does not update the document in PostgreSQL.
3. `ingestion_input.py` checks version, UUID, positive revision, owner, and unexpected
   fields. `Field(alias="documentId")` accepts the existing TypeScript JSON name
   while Python uses `job.document_id`. `@field_validator` registers a validation
   method with Pydantic. `@classmethod` passes the model class as `cls`. These methods
   run during validation, not when the worker accesses an already validated field.
4. `ingestion_service.py` owns the workflow and its two database transactions. It
   first commits `processing`, then calls the chunker outside a transaction. Its
   final transaction saves both replacement chunks and `completed`.
5. `document_repository.py` contains ownership/revision-filtered SQL, status updates,
   and the advisory-lock query. A successful conditional UPDATE locks the document
   row until its transaction ends. That prevents an edit between checking the
   revision and saving the chunks.
6. `chunk_config_repository.py` inserts the method/size/overlap combination if absent,
   then reads its ID. `ON CONFLICT DO NOTHING` reuses an existing configuration without
   changing its historical settings.
7. `chunk_repository.py` deletes previous chunks and inserts the replacement set.
   Both operations use the service's transaction. `executemany` executes the same
   parameterized insert with each chunk's values. Text chunks have a null page number.
8. `database.py` opens a dedicated Psycopg connection with a five-second connection
   timeout, ten-second statement timeout, and three-second lock timeout.
9. `chunking.py` remains the pure LangChain splitter. It knows nothing about RabbitMQ
   or database transactions. `examples/chunk_text.py` remains a manual inspection tool.

The consumer uses `async def` because broker operations can wait without blocking
other connection work. `await` suspends that coroutine until an operation finishes.
`asyncio.run` starts Python's event loop, which manages those waits.
`await asyncio.to_thread(ingest_text_document, ...)` runs our synchronous database
and chunking function on another thread. This lets the event loop handle RabbitMQ
heartbeats. It does not make several documents run at once; the consumer still
awaits each result before receiving the next job.

## Transactions, locks, and retries

A transaction groups SQL changes that must succeed or fail together. Here, deleting
old chunks, inserting replacements, and marking completed form one transaction.
Although the status UPDATE appears first in the code, other connections cannot see
completed until every statement succeeds and the transaction commits. A failed
insert rolls back the completion update and restores the old chunks.

A session advisory lock is a PostgreSQL lock our workers agree to acquire for a
document ID. It lasts across both short transactions and the chunking work. Closing
the dedicated connection releases it, including when PostgreSQL detects a lost
worker connection. Hash collisions can serialize unrelated documents, but cannot
mix their data. Do not reuse this design through transaction-mode connection pooling.

Web edits do not acquire this advisory lock. They must increment the revision when
changing the source. Every worker status update checks owner, ID, revision, and
expected status, so an old job cannot finish a newer revision. Completed jobs are
ignored on redelivery, preserving the existing chunk IDs.

Queued and processing text documents are eligible. Processing can be reclaimed
once an interrupted worker's advisory lock is gone. Uploaded documents, PDFs,
completed/failed documents, missing documents, and unmatched ownership/revisions
are currently ignored. Do not send PDF jobs to this text-only worker yet.

Invalid JSON goes to the rejected queue without printing its content. Temporary
Psycopg operational errors and busy document locks get three attempts per delivery,
with one- and two-second delays. If those fail, the process exits without acknowledging.
An unexpected processing exception also stops the process. Restart allows RabbitMQ
to redeliver unacknowledged work. Oversized or blank text receives a fixed safe
failure summary in PostgreSQL.

Still pending before Phase 4 is complete:

- Durable attempt counts and terminal handling of unexpected processing failures.
- Recovery of a saved document whose message was never published.
- Production supervision and graceful drain behavior on shutdown.
- Bounded PDF loading/extraction and its failure policy.
- Cross-runtime contract fixtures and explicit broker/crash fault tests.

The current attempt limit resets after restart. The thread wrapper is not a hard
execution timeout. Do not describe either as full crash recovery or bounded PDF
execution. Messages must be persistent and publisher-confirmed when Next.js
publication is implemented; durable queues alone do not provide that guarantee.

## Tests and the meaning of yield

From `worker`, with Docker running and root npm dependencies installed:

```bash
uv run python -m pytest tests/unit -v
uv run python -m pytest tests/integration -v
```

`conftest.py` is pytest's automatically discovered fixture configuration. A test that
names `database` as a parameter asks pytest to prepare that fixture and pass its
value. Fixtures may themselves request other fixtures through their parameters.

Consider the existing fixture:

```python
@pytest.fixture
def database(migrated_database_url: str) -> Iterator[Connection[tuple[object, ...]]]:
    with connect_database(migrated_database_url) as connection:
        with connection.transaction(force_rollback=True):
            yield connection
```

`yield` pauses the function and gives the connection to pytest. The connection and
transaction remain open while the test runs. After the test, pytest resumes the
function after `yield`, even if the test failed. Leaving the transaction block rolls
back the test's writes, then leaving the connection block closes it. `return` would
exit those blocks before the test could use the connection.

A function containing `yield` is a generator. `Iterator[...]` describes the values
it yields, here database connections. This fixture yields exactly once; there is no
loop. Python generators also support repeated yields, but pytest yield fixtures
must provide one value per invocation.

The session fixture yields a disposable database URL after starting PostgreSQL and
applying committed Drizzle migrations. It resumes after the session's tests finish,
then stops the container. Service tests need real commits through independent
connections, so they seed directly and delete their owned rows in `finally` instead
of wrapping the service in the repository tests' rollback fixture.

- Input tests exercise accepted messages and malformed fields.
- Repository tests cover stored values, ownership, revisions, and missing records.
- Service tests cover completion, duplicate delivery, advisory locks, edits during
  chunking, interrupted processing, safe failure, and rollback after an insert fails.
- The broker test uses disposable RabbitMQ and PostgreSQL. It publishes a document
  message twice and malformed JSON, then checks persisted chunks and rejected delivery.

## Chunking settings

The initial defaults are 1,000 Unicode code points and a target overlap of 150.
These are trial values, not measured retrieval optima. Python `len` counts code
points, not UTF-8 bytes, JavaScript UTF-16 units, or model tokens.

The splitter prefers paragraphs, lines, spaces, then characters. It normalizes line
endings and strips surrounding whitespace. Overlap may be smaller at boundaries.
Retained separators count toward the splitting limit before trimming, so very small
limits can split otherwise short words. Meaningful repeated passages remain present.
Change `CHUNKING_METHOD` when normalization or splitting behavior changes.

## PostgreSQL topics to learn next

Start with primary/foreign keys and unique constraints, then transactions and
commit/rollback. Follow with connections versus cursors, row locks and concurrent
updates, and finally indexes and query plans. The service's final transaction is a
concrete exercise in why several successful individual queries are not sufficient.
