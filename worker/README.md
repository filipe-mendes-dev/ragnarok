# Python ingestion worker

The worker consumes RabbitMQ messages and ingests queued text and PDF documents. It loads
an owned revision from PostgreSQL, splits it with LangChain, and saves its chunks.
Next.js publishes new text submissions and verified PDF upload completions.
Failure recovery remains unfinished; see the [backlog](../docs/todo.md).

## Install and run

From `worker`, update the environment and uv-generated lockfile:

```bash
uv sync
```

`pyproject.toml` now declares `aio-pika` and Pydantic directly. aio-pika speaks the
RabbitMQ protocol and handles connection I/O. Pydantic validates incoming JSON,
like Zod in TypeScript. Neither the standard library nor Psycopg provides an AMQP
client. uv owns `uv.lock`; do not edit it manually.

Apply committed migrations with `npm run db:migrate` from the repository root
before starting the worker. The worker never creates or migrates tables.

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
uv run --env-file ../.env worker
```

The `[project.scripts]` entry maps `worker` to `main()` in `ragnarok_ingestion.__main__`.
uv installs the command when syncing the project. The `--env-file` option loads the
root environment. If those variables are already supplied by your shell or deployment,
use `uv run worker`. For that shorter command in a local terminal, first run
`export UV_ENV_FILE=../.env` from the worker directory. This applies to that shell session.
The worker stays running until interrupted or an unrecovered
error occurs. No HTTP server is involved. It declares the durable queues
`ragnarok.ingestion.v1` and `ragnarok.ingestion.rejected.v1`.

Starting the worker does not enqueue existing documents. With the worker running,
start Next.js with `npm run dev` from the repository root and submit a new text
document. Refresh Documents to see completed status. Existing uploaded documents
need a later backfill operation. The TypeScript broker integration test starts the
real Python worker and checks that text submission produces persisted chunks.

Set `INGESTION_QUEUE_NAME` and `INGESTION_REJECTED_QUEUE_NAME` in the root `.env`,
using the values in `.env.example`. Next.js and the uv command above load that file.
Both names are required and must be distinct and nonblank. On separate machines,
deployment must inject the same values into both applications. Renaming a queue
does not move existing messages. No dependency installation is needed for this change.

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
`await asyncio.to_thread(ingest_document, ...)` runs our synchronous database
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

Queued and processing text and PDF documents are eligible. Processing can be reclaimed
once an interrupted worker's advisory lock is gone. Uploaded documents,
completed/failed documents, missing documents, and unmatched ownership/revisions
are ignored. PDF jobs load the authorized storage key from S3.

Invalid JSON goes to the rejected queue without printing its content. Temporary
Psycopg operational errors, PDF download failures, and busy document locks get three attempts per delivery,
with one- and two-second delays. If those fail, the process exits without acknowledging.
An unexpected processing exception also stops the process. Restart allows RabbitMQ
to redeliver unacknowledged work. Oversized or blank text receives a fixed safe
failure summary in PostgreSQL.

Deferred recovery, retry, supervision, and fault-test work is tracked in the
[backlog](../docs/todo.md). It does not block Phase 5, but deployment reliability
remains unfinished.

The current attempt limit resets after restart. PDF downloading, extraction, and chunking share
one subprocess deadline, but this does not provide full crash recovery.
Next.js publishes persistent messages and waits for publisher confirms.

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

## PDF service integration

Extraction uses pypdf layout mode, preserving position-based lines and paragraph
gaps. Pages without content streams are skipped. Layout mode can add spaces and
does not guarantee correct reading order for columns or tables. Restart the worker
after code changes; existing chunks require explicit re-ingestion or a new upload.


`ingest_document(database_url, job)` selects the owned source in PostgreSQL and calls
`process_pdf(storage_key, settings)` for PDFs. One child downloads, extracts, and chunks
in sequence. `load_pdf_from_s3` and `chunk_pdf` are ordinary synchronous helpers.
Only the storage key/settings travel to the child; PDF bytes stay there. JSON chunks
return to the parent, where Pydantic validates them before atomic persistence.

One 30-second deadline covers the complete child operation, replacing two separate
30-second stage deadlines. An overdue child is killed and reaped, and the matching
revision becomes failed. Download infrastructure errors retain per-delivery retries.
Expected source/parser errors use safe JSON messages, not raw child stderr. The parent
keeps its database connection, revision checks, RabbitMQ heartbeats, and acknowledgement
responsibility. The child has no database work. This is not a memory sandbox.

Run local infrastructure, Next.js, and the worker with the commands above, upload a
PDF, and refresh Documents. Existing uploaded documents still need completion/recovery;
worker startup does not backfill them. No dependency or migration changes are needed.

## Troubleshooting worker failures

Start from `worker/` with `uv run --env-file ../.env worker`. Logs go to stderr
and include timestamps and event names. Follow `job_received` by document/revision,
then `ingestion_stage` to see how far execution reached. `job_attempt_failed`
precedes a retry; `job_failed` and `worker_stopped` identify fatal failures.
`pdf_child_failed` preserves safe exception details from the PDF subprocess:
exit code 3 means download failed; exit code 1 means extraction/chunking failed.
`pdf_child_timeout` identifies the overall PDF deadline.

Exception details include class and file/function/line locations, and available
SQLSTATE, storage error codes, or missing configuration key names. They omit raw
exception messages and source contents. Share these event lines when diagnosing
a failure. Logs are not stored centrally yet. A `job_finished` outcome of `failed`
means the document's failure was persisted and the message acknowledged; consult
the document's safe processing error for the reason.
