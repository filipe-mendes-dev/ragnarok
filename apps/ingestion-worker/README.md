# Python ingestion worker

The worker consumes RabbitMQ messages for queued text and PDF documents. It loads
the owned source revision from PostgreSQL, extracts PDF text when needed, chunks
the text, requests embeddings from OpenRouter, and atomically saves chunks, vectors,
and completion status. Next.js handles document submission and query embedding.

## Install and run

From `apps/ingestion-worker/`:

```bash
uv sync
uv run --env-file .env worker
```

Apply committed Drizzle migrations with `npm run db:migrate` from `apps/web/`
before starting the worker. The worker does not migrate its database. Its
environment needs `DATABASE_URL`, `RABBITMQ_URL`, distinct
`INGESTION_QUEUE_NAME` and `INGESTION_REJECTED_QUEUE_NAME` values, and
`OPENROUTER_API_KEY`. PDF ingestion also needs the S3 variables from
`.env.example`. The same OpenRouter key serves generation and query embeddings in
Next.js.

`uv` owns `uv.lock`; do not edit it manually. `aio-pika` handles RabbitMQ delivery,
Pydantic validates untrusted messages and provider responses, PyMuPDF extracts
page text with `sort=False`, and `langchain-text-splitters` determines chunk
boundaries. The worker no longer loads a local inference model or runs an HTTP
server.

## Embedding settings

`src/ragnarok_ingestion/embedding.py` owns the model slug, configuration revision,
dimensions, `CHUNKING_SETTINGS` (size and overlap), and `BATCH_SIZE`. Change
`CHUNKING_SETTINGS` to tune document chunks. Both values count Unicode characters.
`openrouter_embedding.py` owns the provider endpoint, timeout, bearer
authentication, and response validation. These modules are separate so chunking
and ingestion do not depend on HTTP details.

The current model is `openai/text-embedding-3-small` through OpenRouter. Each
request asks for 1,536 dimensions. The configuration revision
`openrouter-1536-v1` identifies this application's choice of model and dimensions;
it is not an upstream model snapshot. The worker splits source text into at most
1,000 characters per chunk, with a target overlap of 150. Short chunks support
page-specific citations. `OPENROUTER_EMBEDDINGS_URL` can override the endpoint
for local integration tests; production uses OpenRouter.

Changing the model or dimensions requires compatible query embeddings. Changing
dimensions also requires a Drizzle schema migration because
`document_chunk.embedding` is currently `vector(1536)`. A new size or overlap
creates a new `chunk_config` row automatically; change the method identifier in
`chunking.py` only if the algorithm or measurement unit changes.

## Ingestion and failure handling

`__main__.py` loads configuration and starts the thin RabbitMQ consumer.
`ingestion_service.py` owns processing. It claims an owned document revision,
extracts and chunks outside a transaction, then updates status and replaces chunks
and vectors in one final transaction. The dedicated PostgreSQL connection holds an
advisory lock for that document across the job. Owner and revision predicates
reject stale work after an edit. The consumer acknowledges only after the service
commits an outcome. A repeated delivery cannot create duplicate active chunks.

The consumer handles one document at a time. It runs synchronous database and
provider work on a thread so RabbitMQ heartbeats continue. Temporary database,
storage, provider, or lock failures get three attempts within one delivery, with
one- and two-second delays. If those fail, the worker exits without acknowledging;
restart permits redelivery. The durable attempt limit, automatic restart,
publication recovery, and user-facing retry action remain future work in the
[backlog](../../docs/todo.md).

Invalid queue JSON is rejected to the diagnostic queue without logging its body.
Safe input and PDF failures mark the matching document revision failed. Provider
errors do not expose response bodies in document state or logs. PDF download and
extraction share a 30-second child-process deadline; embedding runs afterward and
has its own provider request timeout.

## Existing development data

Drizzle-generated migrations `0010_drop-legacy-embeddings.sql` and
`0011_add-openrouter-embeddings.sql` replace the old vector and model columns.
Existing chunk text remains, but its embeddings are discarded. Recreate any sample
documents you still want to search after applying the migrations. New documents
are embedded through OpenRouter during normal ingestion.

## Verification

From `apps/ingestion-worker/`, with Docker and web npm dependencies available:

```bash
uv run python -m pytest tests/unit -v
uv run python -m pytest tests/integration -v
```

Integration tests apply committed migrations to disposable Testcontainers
PostgreSQL and use disposable RabbitMQ where needed. The TypeScript broker test
starts the real Python worker against a local OpenRouter-shaped test server, so
normal tests do not spend API credits. To inspect a live model response manually,
set the API key and run `uv run --env-file .env python examples/embed_text.py`.
The separate opt-in ranking benchmark is described in
[retrieval.md](../../docs/retrieval.md).
