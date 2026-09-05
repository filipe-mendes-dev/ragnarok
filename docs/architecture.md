# RAGnarok Architecture

## Document status

- Status: Accepted for V1 implementation
- Last updated: 2026-09-05
- Related product definition: `docs/product-requirements.md`

## Architectural summary

RAGnarok V1 is a TypeScript modular monolith with two application processes:

1. A Next.js web process that renders the UI and owns the browser-facing HTTP boundary.
2. A BullMQ worker process that performs asynchronous document ingestion.

Both processes share explicitly server-side application, persistence, RAG, queue, and storage modules. PostgreSQL is the durable system of record. Redis coordinates background jobs. Original PDFs live in S3-compatible object storage.

V1 does not introduce a separate Fastify, NestJS, or Python API because there is no independent API consumer or deployment requirement that justifies another network boundary.

## Finalized V1 stack

| Concern | Choice | Purpose |
| --- | --- | --- |
| Web framework | Next.js App Router | UI rendering, routing, server-side data access, and browser-facing HTTP endpoints |
| UI | React | Interactive application interface |
| Language | TypeScript with strict compiler settings | Typed application and infrastructure boundaries |
| Runtime | Node.js 24 LTS | Supported production runtime for the web and worker processes |
| Package manager | npm | Minimal tooling and reproducible CI installs with `npm ci` |
| Styling | Tailwind CSS with semantic CSS variables | Fast dashboard implementation with a controlled token boundary |
| Database | PostgreSQL | Durable application, document, conversation, and trace state |
| ORM and migrations | Drizzle ORM | Typed queries and committed schema migrations |
| Vector search | pgvector | Semantic retrieval inside PostgreSQL |
| Lexical search | PostgreSQL full-text search | Hybrid retrieval without another search service |
| Queue | BullMQ | Retryable asynchronous ingestion jobs |
| Queue coordination | Redis | BullMQ job state and coordination, not authoritative business state |
| Object storage | S3-compatible storage | Original uploaded PDF bytes |
| Unit/integration tests | Vitest | Fast tests for application and retrieval behavior |
| End-to-end tests | Playwright | Critical browser flows once the first complete flow exists |
| Local infrastructure | Docker Compose | Reproducible PostgreSQL, Redis, and object storage |
| Production runtime | Docker Compose and Nginx | Single-VPS process isolation, HTTPS, and web-instance load balancing |
| CI/CD | GitHub Actions | Lint, type checking, tests, build, and later deployment |

Authentication, AI providers, PDF extraction library, and production object-storage provider remain implementation decisions.

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
│   │   ├── documents/
│   │   ├── ingestion/
│   │   ├── queue/
│   │   ├── rag/
│   │   │   ├── retrieval/
│   │   │   ├── context/
│   │   │   ├── generation/
│   │   │   └── citations/
│   │   ├── storage/
│   │   └── observability/
│   ├── shared/                    # Environment-neutral schemas and interfaces
│   └── worker/
│       └── index.ts               # BullMQ process entry point
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

The directory name is a human convention, not a bundler rule. Next-specific modules that must never enter a Client Component graph use `import "server-only"`. Modules shared with the separately compiled worker do not use that marker unconditionally because `server-only` relies on the React server export condition supplied by the Next.js compiler. Directory import rules and dependency checks protect the complete `src/server` boundary.

### `src/shared`

Contains code that is safe in both browser and server dependency graphs:

- Request and response schemas
- Public DTO interfaces
- Environment-neutral constants
- Pure validation or formatting functions

It does not import database clients, Node-only APIs, secrets, BullMQ, or provider clients.

### `src/worker`

Bootstraps the separately built ingestion worker. The entry point performs process setup and delegates jobs to application workflows in `src/server/ingestion`.

## Client and server dependency graphs

The `server` folder is included in trusted server and worker builds. It is excluded only from browser JavaScript.

```text
Server Component / route handler -> server -> shared
Worker entry point               -> server -> shared
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
  status: "uploaded" | "queued" | "processing" | "completed" | "failed";
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
export { deleteDocument } from "@/server/documents/delete-document";
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

## Runtime topology

### Local development

```text
Host: Next.js dev server + worker watch process
Docker: PostgreSQL/pgvector + Redis + S3-compatible local storage
```

This preserves fast refresh and debugger access while making stateful infrastructure reproducible.

### Production

```text
Internet
-> Nginx / HTTPS
-> two containers using the same Next.js web image
-> PostgreSQL, Redis, object storage, and external AI providers

Redis
-> one BullMQ worker container
-> PostgreSQL, object storage, and embedding provider
```

One multi-stage Dockerfile produces separate web and worker runtime targets. Two web containers demonstrate stateless application replication on one host, not machine-level high availability.

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
