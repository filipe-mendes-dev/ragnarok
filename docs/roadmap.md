# RAGnarok Implementation Roadmap

## Working rule

Complete phases in order. A phase is complete when its observable outcome and verification gate pass. Reranking and visual polish are the first items deferred when schedule pressure appears.

## Phase 0: Repository foundation

Target: Day 1

- [x] Initialize Git with `main` as the default branch.
- [x] Scaffold Next.js App Router with strict TypeScript, npm, Tailwind, ESLint, and `src/`.
- [x] Add canonical `lint`, `typecheck`, `test`, `check`, and `build` scripts.
- [x] Add semantic CSS variables and mobile-first base styles.
- [x] Add Vitest; defer Playwright configuration until the first user flow exists.
- [ ] Add `.env.example` and validate server environment variables.
- [x] Add a basic health endpoint.

Gate: a clean install can lint, type-check, test, build, and serve the health endpoint.

## Phase 1: Local infrastructure and persistence

Target: Days 1-2

- [x] Add Docker Compose services for PostgreSQL with pgvector, Redis, and local S3-compatible storage.
- [ ] Configure Drizzle and committed migrations.
- [ ] Implement initial user, document, chunk, conversation, message, retrieval-run, and candidate tables only as needed.
- [ ] Verify database persistence across container restarts.

Gate: migrations create the schema from an empty database and the application can read/write a test record.

Failure test: stop PostgreSQL and confirm the application reports a bounded, observable failure.

## Phase 2: Authentication and authorization

Target: Day 2

- [ ] Select a practical authentication library or provider.
- [ ] Implement sign in, sign out, protected routes, and cached server-side identity lookup.
- [ ] Add direct `userId` ownership to private resources.
- [ ] Test cross-user document access at the repository/query boundary.

Gate: two test users cannot read or mutate each other's resources, including by submitting another user's identifier manually.

## Phase 3: Document sources and object storage

Target: Day 3

- [ ] Submit and edit plain-text documents.
- [ ] Upload text-based PDFs with configurable size and extraction limits.
- [ ] Store original PDF bytes in object storage and metadata in PostgreSQL.
- [ ] List and delete owned documents.
- [ ] Expose document state in the UI.

Gate: a user can create, list, edit where allowed, and delete private sources without synchronous ingestion.

Failure test: make object storage unavailable and verify no falsely completed document remains.

## Phase 4: Queue and ingestion worker

Target: Day 4

- [ ] Define a minimal versioned ingestion-job DTO.
- [ ] Enqueue jobs after source creation or text editing.
- [ ] Implement extraction, deterministic chunking, and chunk metadata.
- [ ] Add bounded retries, backoff, timeouts, structured logs, and safe failure state.
- [ ] Make duplicate execution and chunk replacement idempotent.

Gate: documents move visibly through queued, processing, completed, and failed states.

Failure test: terminate the worker mid-job, restart it, and verify a retry cannot produce duplicate active chunks.

## Phase 5: Embeddings and semantic retrieval

Target: Day 5

- [ ] Select the embedding provider, model, dimensions, and similarity metric.
- [ ] Generate chunk embeddings during ingestion and persist them in pgvector.
- [ ] Embed user queries and retrieve top-k candidates.
- [ ] Apply `userId` and selected-document filters inside the retrieval query.
- [ ] Capture embedding and vector-search latency and scores.

Gate: a deterministic test corpus retrieves the expected owned document in top-k.

## Phase 6: Grounded generation and citations

Target: Day 6

- [ ] Keep `retrieve()` and `generate()` as separate boundaries.
- [ ] Implement explicit, versioned context and prompt construction.
- [ ] Add a bounded context budget and source identifiers.
- [ ] Generate grounded answers with abstention behavior.
- [ ] Validate that returned citation identifiers map to selected chunks.

Gate: the UI produces an answer whose citations open the exact source evidence, and an unsupported question abstains.

## Phase 7: Metadata and hybrid retrieval

Target: Day 7

- [ ] Filter by selected documents and other justified metadata.
- [ ] Add PostgreSQL full-text retrieval.
- [ ] Fuse semantic and lexical ranks with a simple documented strategy.
- [ ] Record candidates and rankings for each stage.

Gate: exact identifiers favor lexical retrieval while semantic paraphrases remain discoverable, with both paths visible in the trace.

## Phase 8: Context refinement and optional reranking

Target: Day 8

- [ ] Deduplicate overlapping evidence and finalize context ordering.
- [ ] Test context-size and prompt-injection handling.
- [ ] Add reranking only if the deployed core schedule remains safe.

Gate: selected context is bounded, inspectable, and does not contain unexplained duplicate chunks.

## Phase 9: Trace and debug experience

Target: Day 9

- [ ] Persist one retrieval run per question.
- [ ] Display filters, models, prompt version, candidates, scores, selected chunks, latencies, tokens, and safe errors.
- [ ] Correlate answer, trace, request, and logs.
- [ ] Sanitize all public trace fields.

Gate: a recruiter can inspect the full retrieval-to-generation path from an answer without server access.

## Phase 10: Evaluation

Target: Day 10

- [ ] Create 15-30 gold questions against a controlled corpus.
- [ ] Measure expected-source retrieval, recall at k, citations, abstention, latency, and token use.
- [ ] Produce a readable command-line or page summary.
- [ ] Keep manual and LLM-judge results explicitly distinguished.

Gate: one command produces a repeatable evaluation report with documented limitations.

## Phase 11: Reliability and test hardening

Target: Day 11

- [ ] Test provider timeouts, malformed PDFs, Redis loss, worker crashes, and duplicate jobs.
- [ ] Add integration tests for authorization, persistence workflows, and state transitions.
- [ ] Add Playwright coverage for the critical signed-in document-to-answer flow.
- [ ] Verify structured error and logging behavior.

Gate: expected failures reach explicit recoverable or failed states without hanging or silently losing work.

## Phase 12: Production containers and VPS deployment

Target: Day 12

- [ ] Build separate web and worker targets from one multi-stage Dockerfile.
- [ ] Add production Compose with Nginx, two identical web containers, worker, PostgreSQL, and Redis.
- [ ] Configure internal networking, volumes, runtime secrets, health checks, graceful shutdown, and restart policies.
- [ ] Configure DNS and HTTPS.
- [ ] Verify backup and restore steps for durable state.

Gate: the application is reachable through HTTPS and only Nginx exposes public HTTP ports.

## Phase 13: CI/CD and delivery packaging

Target: Days 13-14

- [ ] Run clean install, lint, type checking, tests, and production build in GitHub Actions.
- [ ] Add the simplest explainable VPS deployment flow and post-deploy health check.
- [ ] Complete README architecture and runtime explanations.
- [ ] Capture product, citation, trace, and architecture screenshots.
- [ ] Write portfolio and CV material using only implemented functionality.

Gate: a merge to `main` passes quality gates, deploys predictably, and leaves a recruiter-ready public project.

## Final stop condition

Stop adding features when the deployed application supports private asynchronous ingestion, grounded answers, inspectable citations, an understandable trace, and documented evaluation and deployment. Record unfinished optional work as future work rather than delaying shipment.
