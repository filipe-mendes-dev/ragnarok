# RAGnarok

A learning and portfolio project for private document question answering.
Next.js and TypeScript own authentication and document submission. A Python worker
consumes RabbitMQ jobs, extracts PDF text, splits text with LangChain, and persists
chunks in PostgreSQL. Original PDFs remain in S3-compatible storage.

Text/PDF ingestion, semantic retrieval, and plain answer generation work locally.
The web app and Python worker request embeddings from OpenRouter. Chat saves retrieval
and generation details and links available citations. Production deployment and
reliability hardening remain subsequent milestones.

## Documentation

- [Product requirements](docs/product-requirements.md): intended V1 behavior.
- [Architecture](docs/architecture.md): boundaries, runtime flow, and current limitations.
- [Roadmap](docs/roadmap.md): implementation sequence and phase status.
- [Backlog](docs/todo.md): deferred work and completion conditions.
- [Worker guide](apps/ingestion-worker/README.md): Python setup, message processing, tests, and troubleshooting.

## Local development

Use Node.js 24, npm 11, Python 3.14 through uv, and Docker Compose.
Create ignored `.env` files from the examples at the repository root, in
`apps/web`, and in `apps/ingestion-worker`. The root file configures Compose;
each application reads its own file. Keep shared database, queue, and storage
values consistent. Do not overwrite an existing environment or commit credentials.

From the repository root:

```bash
docker compose -f compose.dev.yml up -d
docker compose -f compose.dev.yml ps
cd apps/web
npm ci
npm run db:migrate
npm run dev
```

Wait for PostgreSQL, RabbitMQ, and MinIO to be ready before migrating or starting
the applications. Compose initializes the configured bucket. Redis is disabled by
default. Applying committed migrations is required; worker startup does not apply them.

In a separate terminal, from `apps/ingestion-worker/`:

```bash
uv sync
uv run --env-file .env worker
```

Set `OPENROUTER_API_KEY` in both application `.env` files before starting them.
Embeddings use `openai/text-embedding-3-small` through OpenRouter. To generate
answers, also set `GENERATION_MODEL` to an OpenRouter model slug.
`GENERATION_MAX_OUTPUT_TOKENS` defaults to 2048 and `GENERATION_TIMEOUT_MS` defaults
to 45000. Set either in `apps/web/.env` and restart Next.js to change the limits.
Generation runs retain the model, token counts, finish reason, provider response ID,
latency, and a safe error code. Server logs use the run and attempt IDs to correlate
provider responses without logging prompts or answers.

Open http://localhost:3000, sign in, submit text or upload a PDF, and refresh the
document list to see its status. Next.js and the worker must
be running. Ask a short, standalone English question in Chat to get an answer and
inspect the retrieved chunks.
See the worker guide for recovery limitations and how to inspect failures.

## Verification

From `apps/web/`, `npm run check` runs lint, type checking, and TypeScript
unit/integration tests. `npm run build` checks the production web build.
From `apps/ingestion-worker/`, run `uv run python -m pytest tests/unit` or
`uv run python -m pytest tests/integration`.
Integration tests require Docker and the Python environment. They use disposable
Testcontainers infrastructure and a local OpenRouter-shaped test server. The
synthetic ranking benchmark and its limitations are described in
[retrieval.md](docs/retrieval.md).
