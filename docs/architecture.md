# RAGnarok Architecture

## Document status

- Status: Accepted for V1 implementation
- Last updated: 2026-09-08
- Related product definition: `docs/product-requirements.md`

## Architectural summary

RAGnarok V1 has a TypeScript web application and a Python ingestion worker in one repository:

1. A Next.js web process that renders the UI and owns the browser-facing HTTP boundary.
2. A Python RabbitMQ worker process that performs asynchronous document ingestion.

The web application owns TypeScript services under `src/server`. The worker owns Python ingestion services under `worker/src/ragnarok_ingestion`. They share a versioned JSON message contract and the PostgreSQL schema, not executable modules. Drizzle remains the sole migration owner; Python repositories will query that schema without a second migration system. PostgreSQL is the durable system of record. RabbitMQ coordinates background jobs. Original PDFs live in S3-compatible object storage.

V1 does not introduce a separate Fastify, NestJS, or Python API because there is no independent API consumer or deployment requirement that justifies another network boundary.

## Finalized V1 stack

| Concern | Choice | Purpose |
| --- | --- | --- |
| Web framework | Next.js App Router | UI rendering, routing, server-side data access, and browser-facing HTTP endpoints |
| UI | React | Interactive application interface |
| Languages | Strict TypeScript for web; typed Python 3.14 for ingestion | Web development plus Python document-processing experience |
| Runtimes | Node.js 24 LTS and Python 3.14 | Separate web and ingestion processes |
| Package management | npm for web; uv for worker | uv manages Python, the worker environment, and uv.lock; initial lock generated and inspected |
| Text splitting | langchain-text-splitters | Local recursive character splitting; no model API required |
| Styling | Tailwind CSS with semantic CSS variables | Fast dashboard implementation with a controlled token boundary |
| Database | PostgreSQL | Durable application, document, conversation, and trace state |
| ORM and migrations | Drizzle ORM | Typed queries and committed schema migrations |
| Vector search | pgvector | Semantic retrieval inside PostgreSQL |
| Lexical search | PostgreSQL full-text search | Hybrid retrieval without another search service |
| Message broker | RabbitMQ | Deliver ingestion messages to workers; services own document state and retry policy |
| Object storage | S3-compatible storage | Original uploaded PDF bytes |
| Unit/integration tests | Vitest for TypeScript; pytest for Python; existing unittest cases retained during adoption | Test each runtime independently |
| Integration infrastructure | Testcontainers | Disposable PostgreSQL/pgvector instances with migrations applied from scratch |
| End-to-end tests | Playwright | Critical browser flows once the first complete flow exists |
| Local infrastructure | Docker Compose | Reproducible PostgreSQL, RabbitMQ, and object storage |
| Production runtime | Docker Compose and Nginx | Single-VPS process isolation, HTTPS, and web-instance load balancing |
| CI/CD | GitHub Actions | Lint, type checking, tests, build, and later deployment |

Authentication uses Better Auth. AI providers, the PDF extraction library, and the production object-storage provider remain implementation decisions.

## Repository structure

Directories are created only when the first real file for that responsibility exists.

```text
ragnarok/
├── src/
│   ├── app/                       # Next.js route and rendering boundary
│   │   ├── (public)/
│   │   ├── (authenticated)/
│   │   │   ├── documents/
│   │   │   ├── chat/
│   │   │   └── traces/
│   │   └── api/
│   ├── features/                  # Product-facing React components
│   │   ├── documents/
│   │   ├── chat/
│   │   └── traces/
│   ├── server/                    # Trusted Node.js modules
│   │   ├── auth/
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── schema/           # Drizzle tables grouped by capability
│   │   ├── modules/               # Business capabilities
│   │   │   ├── documents/
│   │   │   ├── ingestion/
│   │   │   └── rag/
│   │   ├── queue/
│   │   ├── storage/
│   │   └── observability/
│   └── shared/                    # Environment-neutral TypeScript contracts
├── worker/
│   ├── pyproject.toml             # Python dependencies
│   ├── src/ragnarok_ingestion/    # Python chunking and future ingestion services
│   └── tests/unit/                # Python unit tests mirroring the package
├── drizzle/                       # Committed SQL migrations
├── tests/
│   ├── integration/
│   └── fixtures/
├── e2e/
├── docs/
│   ├── product-requirements.md
│   ├── architecture.md
│   └── decisions/                 # Added only for decisions needing their own history
├── infra/
│   └── nginx/
├── public/
├── .github/
│   └── workflows/
├── compose.dev.yml
├── compose.prod.yml
├── Dockerfile
├── drizzle.config.ts
├── package-lock.json
└── package.json
```

## Module responsibilities

### `src/app`

Owns Next.js-specific concerns:

- URL structure and layouts
- Server and Client Component composition
- Route handlers
- Server Actions when they materially simplify a form workflow
- HTTP request parsing and response mapping

Pages and route handlers remain thin. They authenticate, parse input, call an application service, and translate its result or typed error into UI or HTTP output.

### `src/features`

Owns product-facing React components grouped by user capability. Client Components are introduced only around interactive UI. Tailwind classes live with these components and consume semantic CSS variables where appropriate.

### `src/server`

Owns trusted Node.js behavior:

- Application workflows and business rules
- Repositories and database queries
- Authentication and authorization
- Queue and object-storage clients
- Retrieval, context construction, generation, and citation validation
- Structured trace and logging behavior

The directory name is a human convention, not a bundler rule. Next-specific modules that must never enter a Client Component graph use `import "server-only"`. The Python worker does not import TypeScript modules. Framework-independent TypeScript modules can omit that marker when needed by tests; `server-only` relies on the React server export condition supplied by the Next.js compiler. Directory import rules and dependency checks protect the complete `src/server` boundary.

`src/server/modules` groups business capabilities such as documents, ingestion, and RAG. Infrastructure integrations such as the database client, queue, and object storage remain outside that directory. A module may use several infrastructure adapters, and a database table does not automatically require its own module or service.

### `src/shared`

Contains code that is safe in both browser and server dependency graphs:

- Request and response schemas
- Public DTO interfaces
- Environment-neutral constants
- Pure validation or formatting functions

It does not import database clients, Node-only APIs, secrets, RabbitMQ, or provider clients.

### `worker/src/ragnarok_ingestion`

Contains Python ingestion behavior. The future RabbitMQ entry point will handle process setup and delegate to an ingestion service. That service owns Python repository calls and transactions. The initial module is `chunking.py`; no broker consumer exists yet.

## Client and server dependency graphs

The `server` folder belongs to the trusted Next.js server build. It is excluded only from browser JavaScript.

```text
Server Component / route handler -> server -> shared
Python worker entry point        -> Python ingestion service -> Python repositories
Client Component                 -> features/shared UI -> shared
Client Component                 -X-> server
```

Enforcement:

1. Next-only server modules import `server-only`.
2. Client Components use `"use client"` only at the smallest interactive boundary.
3. Client modules never import from `@/server`.
4. Shared modules never re-export server modules.
5. ESLint import restrictions reinforce the dependency rule.
6. A dependency check verifies that client entry points cannot reach `src/server`.
7. CI contains a Next.js build check; a deliberate `server-only` boundary test is performed during setup.
8. Secrets use server-only environment variables and are never passed to Client Components.

`"use server"` is reserved for Server Functions. It is not used as a general replacement for `server-only`.

## DTO boundary

A Data Transfer Object is the intentionally limited data shape allowed to cross a process, transport, or trust boundary. DTOs are not database rows and do not contain behavior.

Example boundaries in RAGnarok:

- Server Component to Client Component props
- HTTP request and response bodies
- Queue job payloads
- Safe public trace data

```ts
interface DocumentRow {
  id: string;
  userId: string;
  storageKey: string | null;
  sourceText: string | null;
  processingError: string | null;
  createdAt: Date;
}

interface DocumentSummaryDto {
  id: string;
  title: string;
  status: "uploading" | "uploaded" | "queued" | "processing" | "completed" | "failed";
  createdAt: string;
}
```

The service maps `DocumentRow` to `DocumentSummaryDto`. This prevents storage keys, full source text, internal errors, and non-serializable `Date` objects from crossing into browser data accidentally.

DTOs are created when a real boundary exists. Internal functions do not receive duplicate DTO shapes merely to satisfy a layering pattern.

## Barrel-file policy

A barrel file is an `index.ts` file that re-exports items from other files:

```ts
export { DocumentList } from "./DocumentList";
```

Small barrels are allowed for a component's intentional public API. Mixed barrels are forbidden. A mixed barrel exposes client-safe and server-only modules from the same entry point, making dependency direction unclear and risking accidental client imports.

```ts
// Forbidden
export { DocumentList } from "./DocumentList";
export { deleteDocument } from "@/server/modules/documents/delete-document";
```

Server and client entry points remain separate. Cross-layer imports prefer explicit module paths when that makes the runtime boundary clearer.

## Application and persistence boundaries

Repositories own persistence operations:

```text
get document row
list owned documents
insert chunks
replace chunks
update document status
```

Application services own user-visible workflows:

```text
create PDF document
edit text document
retry document ingestion
answer a question
delete a document and its stored object
```

Services own transactions that span multiple repositories or workflow steps. Repositories do not encode user intent, and route handlers do not contain business workflows.

PDF uploads use a two-phase object-storage workflow. The server authenticates the user, validates metadata, generates the object key, persists an `uploading` document, and returns a five-minute presigned PUT URL. The browser sends bytes directly to object storage. A completion action performs an ownership-filtered lookup, verifies content type and byte length through object metadata, and atomically transitions the document to `uploaded`. The signed PUT uses `If-None-Match: *` so the same authorization cannot overwrite a verified object.

## Phase 4 decisions and implementation order

RabbitMQ replaces the earlier BullMQ/Redis plan. It connects the TypeScript publisher and the planned Python worker through established messaging clients. Learning message delivery and acknowledgements is an explicit project goal. The trade-off is more application work for retry delays, attempt limits, and failure handling than BullMQ supplies through job options.

RabbitMQ does not use Redis. Redis is disabled by default behind the `legacy-redis` Compose profile, and the web environment no longer requires `REDIS_URL`. Its volume is retained. An existing Redis container must be stopped explicitly; changing profiles does not stop a running container. RabbitMQ configuration remains pending. The topology below describes the target, not infrastructure already implemented.

Start with one ingestion queue and one Python worker process. The worker delegates to an ingestion service and initially processes one document at a time. A single message covers loading, extraction, chunking, and persistence. Retries may repeat computation; duplicate persisted chunks remain forbidden. PostgreSQL stores document status and chunks. RabbitMQ carries a versioned message containing `version`, `documentId`, `revision`, and `userId`; it does not carry source contents or storage credentials. The producer supplies the authenticated owner, and the service checks ownership and revision in its database query before reading a source.

A consumer acknowledges delivery only after the service has committed its outcome. Delivery can repeat, so chunk replacement and document completion must commit together and reject stale revisions. Saving a document and publishing a message are separate operations; durable scheduling intent and recovery must close that failure gap when queue integration is implemented. RabbitMQ acknowledgements do not establish business completion in PostgreSQL.

Implement in small steps:

1. Inspect sample text and define chunk output, size measurement, and overlap behavior. Implement and unit-test a deterministic chunking function without a queue or database.
2. Define the chunk schema, generate its migration, and test persistence against an empty Testcontainers database.
3. Implement source loading, PDF extraction, and the ingestion service with focused service tests.
4. Add RabbitMQ configuration and implement publication, a thin consumer, bounded retries, and recovery. Test actual broker delivery and worker crashes with Testcontainers.

Start with paragraph-aware splitting and a maximum size. Chunks can have different sizes. The initial Python chunker uses 1,000 Unicode code points and a target overlap of 150, both adjustable. These are trial values pending sample review and later retrieval evaluation. Its initial output contains ordinal and text; document revision, page locations, and persistence metadata follow in later steps. Store one active chunk set per document, including source revision, order, text, source location where available, and enough method/version/settings metadata to identify how it was produced. Later customization can change settings or replace the method; simultaneous chunk sets are deferred.

The Python chunker uses the pinned `langchain-text-splitters` package and its `RecursiveCharacterTextSplitter`. This local operation needs no provider credentials. Ordinary functions remain suitable for this fixed ingestion workflow. LangGraph and agents are outside V1. After ordinary RAG works, a separate learning exercise can introduce tool calling, then conditional workflows and persisted execution. Python is an explicit learning choice for this milestone. It adds dependency management, message-contract validation in both languages, and separate persistence code. It does not add a Python HTTP API. See `worker/README.md` for setup and current limitations.

## Chunk persistence

The Phase 4 schema definitions are `src/server/db/schema/document-chunks.ts` and `src/server/db/schema/chunk-configs.ts`.
Migration generation and database verification are pending.

Each `document_chunk` row stores:

- `id`: UUID for referring to the passage later.
- `document_id`: parent document, with cascade deletion. Ownership is checked by joining the document and filtering its `user_id`; it is not duplicated on chunks.
- `revision`: the source revision that produced the chunk. It deliberately does not reference the document's mutable current revision, so old chunks survive edits until replacement commits.
- `ordinal`: zero-based position across the document, not restarted on each PDF page.
- `text`: nonblank chunk content.
- `page_number`: nullable for submitted text; a positive one-based PDF page when available. Initial PDF extraction will split each page separately so a chunk belongs to one page. This simplifies citations but can split context across page boundaries.
- `chunk_config_id`: required reference to the configuration that produced this chunk.
- `created_at`: insertion timestamp.

The unique index on `(document_id, revision, ordinal)` prevents duplicate positions and supports document/revision lookups. Settings live in `chunk_config`, with a UUID, `chunking_method`, `chunk_size`, `chunk_overlap`, and creation timestamp. A unique index on method, size, and overlap allows reuse across documents. Sizes use Unicode code points, not model tokens. Referenced configurations cannot be deleted. Configurations must be treated as immutable by application services: new settings or method versions get a different row. The schema does not prevent direct SQL updates to a configuration.

The ingestion service must check text length against the selected configuration and use one configuration within a replacement set, check the current revision, and replace chunks plus completion status atomically. A PostgreSQL CHECK cannot read the referenced configuration, so text length is no longer checked against size on the chunk row. Constraints alone do not enforce those workflow rules. The schema allows multiple revisions to coexist; the replacement workflow determines which set remains active.

No embeddings, lexical-search fields, or source offsets are added in this step. Drizzle owns the migration; Python will insert into the resulting PostgreSQL table through Psycopg after the migration is verified.

## Python worker integration plan

The initial Python package contains chunking only. The following describes the planned integration, not implemented broker or database code.

Next.js authenticates the user and saves the source through its existing TypeScript services and Drizzle repositories. It publishes a versioned JSON message through RabbitMQ. A separately running Python consumer validates that message and delegates to the Python ingestion service. The service queries PostgreSQL with owner, document, and revision filters before accessing the source, then calls extraction and chunking. The web application continues to read status from PostgreSQL through Drizzle; no callback to Next.js is required for completion.

Use Pydantic for the incoming Python message when that boundary is implemented, with strict validation and forbidden extra fields. It plays the same validation role as Zod. Preserve the existing JSON field names across languages and test the same valid and invalid messages in both runtimes. Internal chunk values remain dataclasses. Pydantic is not a persistence layer or an authorization mechanism.

The recommended initial database client is Psycopg 3 with parameterized SQL in focused Python repositories. No Python database dependency has been added yet. Psycopg handles PostgreSQL connections and queries; an ORM is not required for the small ingestion query set. Drizzle continues to define and generate the shared schema and migrations. Python tests apply those same migrations to disposable PostgreSQL infrastructure; the worker does not create tables or introduce Alembic migrations.

Python services own transaction boundaries and pass a connection to repositories. Claiming work uses a short transaction. Extraction and chunking happen outside it. Final persistence rechecks the current revision and claim, replaces chunks, and marks completion in one transaction. A consumer acknowledges the message after the outcome is committed. Retrying computation is acceptable; duplicate or stale persisted chunks are not.

Using Python means SQL queries do not inherit Drizzle's compile-time schema checks. Typed row mapping, shared contract fixtures, and database integration tests must catch drift. Implement Python ingestion operations only; do not copy the web application's upload and listing services.

## Input validation naming

Use `<domain>-input.ts` for runtime validation of incoming data, matching `document-input.ts` and `ingestion-input.ts`. Export named `parse<Operation>Input` functions that accept `unknown` and return an explicitly typed value. Name the resulting interface `<Operation>Input`, for example `IngestionJobInput`, and keep its Zod schema private as `<operation>InputSchema` unless another caller actually needs it.

Python modules use snake_case, for example `ingestion_input.py` and `parse_ingestion_job_input`. The future consumer must validate JSON at runtime; Python annotations alone do not validate messages.

Several related inputs may share a domain file. Scalar validators may keep names such as `parseDocumentId`. This convention applies to new domain input modules; it does not require renaming existing environment configuration or shared document contracts.

## Runtime topology

### Local development

```text
Host: Next.js dev server + Python worker process
Docker: PostgreSQL/pgvector + RabbitMQ + S3-compatible local storage
Integration tests: disposable PostgreSQL/pgvector; focused RabbitMQ and S3 adapter tests use disposable containers
```

This preserves fast refresh and debugger access while making stateful infrastructure reproducible.

### Production

```text
Internet
-> Nginx / HTTPS
-> two containers using the same Next.js web image
-> PostgreSQL, RabbitMQ, object storage, and external AI providers

RabbitMQ
-> one Python RabbitMQ worker container
-> PostgreSQL, object storage, and embedding provider
```

Production packaging will use separate Node.js web and Python worker runtime targets. Two web containers demonstrate stateless application replication on one host, not machine-level high availability.

## Why there is no separate API framework in V1

Next.js supplies the only browser-facing backend-for-frontend boundary currently required. Adding Fastify, NestJS, or FastAPI would introduce another build, deployment, authentication boundary, health check, API contract, and network failure mode without serving another client.

OpenAPI generation alone is not sufficient justification. An internal, single-consumer interface can remain typed through schemas and application service calls without becoming a network API.

## Evolution path

Framework-independent services and repositories make future extraction possible without designing V1 as a distributed system prematurely.

A separate API becomes justified if RAGnarok gains an independent mobile client, third-party API consumers, separate deployment/scaling requirements, or team ownership requiring an explicit service boundary.

Possible future monorepo:

```text
apps/
  web/                 # Next.js
  api/                 # Prefer Fastify or FastAPI based on the actual requirement
  worker/
packages/
  contracts/           # Versioned request/response schemas
  database/            # Only if API and worker genuinely share persistence code
```

- Fastify fits a function-oriented TypeScript API with a relatively small framework surface.
- NestJS fits a larger team that benefits from class-based modules, decorators, and dependency injection.
- FastAPI fits when meaningful Python-only retrieval, ML, or data-processing libraries justify a Python runtime.

Technology migration is not itself a goal. A future framework must solve a demonstrated runtime, ownership, client, or ecosystem problem.
