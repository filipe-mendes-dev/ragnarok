# RAGnarok

A learning and portfolio project for private document question answering.
Next.js and TypeScript own authentication and document submission. A Python worker
consumes RabbitMQ jobs, extracts PDF text, splits text with LangChain, and persists
chunks in PostgreSQL. Original PDFs remain in S3-compatible storage.

Text/PDF ingestion and semantic retrieval work locally. One internal Python service
loads the embedding model and serves both ingestion and queries. Chat displays
retrieved chunks and saved retrieval details. Generation is not implemented yet;
production deployment and reliability hardening remain subsequent milestones.

## Documentation

- [Product requirements](docs/product-requirements.md): intended V1 behavior.
- [Architecture](docs/architecture.md): boundaries, runtime flow, and current limitations.
- [Roadmap](docs/roadmap.md): implementation sequence and phase status.
- [Backlog](docs/todo.md): deferred work and completion conditions.
- [Worker guide](worker/README.md): Python setup, message processing, tests, and troubleshooting.

## Local development

Use Node.js 24, npm 11, Python 3.14 through uv, and Docker Compose.
Install web dependencies with `npm ci`. Create a local `.env` from `.env.example`
if it does not already exist, then configure its values. Do not overwrite an existing
environment or commit credentials.

From the repository root:

```bash
npm run infra:up
npm run infra:status
npm run db:migrate
npm run dev
```

Wait for PostgreSQL, RabbitMQ, and MinIO to be ready before migrating or starting
the applications. Compose initializes the configured bucket. Redis is disabled by
default. Applying committed migrations is required; worker startup does not apply them.

In a separate terminal, from `worker/`:

```bash
uv sync
uv run --env-file ../.env python -m ragnarok_ingestion.embedding_server
```

Provision the pinned model following [the worker guide](worker/README.md#local-embeddings).
Set `EMBEDDING_SERVICE_URL=http://127.0.0.1:8081` in the existing root `.env`.
Then start `uv run --env-file ../.env worker` in another terminal from `worker/`.

Open http://localhost:3000, sign in, submit text or upload a PDF, and refresh the
document list to see its status. Next.js, the worker, and the embedding service must
be running. Ask a short, standalone English question in Chat to inspect retrieved chunks.
See the worker guide for recovery limitations and how to inspect failures.

## Verification

From the repository root, `npm run check` runs lint, type checking, and TypeScript
unit/integration tests. `npm run build` checks the production web build.
From `worker/`, run `uv run python -m pytest tests/unit` or
`uv run python -m pytest tests/integration`.
Integration tests require Docker, the Python environment, and the provisioned model.
They use disposable Testcontainers infrastructure. The synthetic ranking benchmark
and its limitations are described in [retrieval.md](docs/retrieval.md).
