# RAGnarok Engineering Instructions

## Scope

- Read `docs/product-requirements.md` and `docs/architecture.md` before architectural changes.
- Keep V1 within the agreed two-week scope. Do not add deferred technologies without a demonstrated requirement.
- Do not modify unrelated behavior. Explain any necessary scope expansion before implementing it.

## TypeScript

- Use strict TypeScript. Never use `any`; use `unknown` with narrowing or define an interface.
- Prefer interfaces unless a union, mapped type, or inference provides a concrete reason for a type alias.
- Prefer small named functions for application behavior and arrow functions for callbacks.
- Keep untrusted boundaries runtime-validated and public inputs/outputs explicitly typed.

## Architecture

- Keep `src/app` thin: parse transport input, authenticate, call a service, and map the result.
- Keep trusted Node.js behavior in `src/server`; client code must not import from it.
- Keep `src/shared` environment-neutral. It must not import secrets, database clients, BullMQ, storage clients, or Node-only APIs.
- Services own workflows, business rules, typed domain errors, and multi-repository transactions.
- Repositories own persistence queries and DB-facing shapes; they do not encode user workflows.
- Keep retrieval and generation separate. Apply user authorization inside persistence and retrieval queries.
- Use DTOs only at real boundaries and expose the minimum safe, serializable fields.
- Avoid mixed client/server barrel files. Small component barrels are optional.
- The worker entry point delegates to ingestion services; it must not contain the ingestion workflow itself.

## React and UI

- Use Next.js App Router and keep Client Components at the smallest interactive boundary.
- Use Tailwind utilities with semantic CSS variables. Do not add global component selectors or raw colors when a token exists.
- Support long text and 320px-wide screens without horizontal page overflow.
- Preserve visible focus states and semantic HTML. Do not rely on hover alone for primary actions.

## Quality

- Add dependencies only when they solve a current requirement.
- Keep unit tests in `tests/unit` and integration tests in `tests/integration`, mirroring the relevant `src` path.
- Add focused tests for business rules, authorization boundaries, retrieval behavior, and failure handling.
- Before finalizing implementation changes, run the relevant subset of `npm run check`, tests, and `npm run build`.
- Never commit secrets, `.env` files, uploaded documents, database volumes, or private evaluation data.
- Use Conventional Commit prefixes. Do not commit unless explicitly requested.
- No emoji in code comments.

### Database migrations

- Never create or edit Drizzle-generated migration SQL or snapshot files by hand.
- Change schema definitions under `src/server/db/schema`, then run `npm run db:generate`.
- Review generated SQL for intended constraints, destructive operations, and unexpected schema changes before applying or committing it.
- Do not inspect generated snapshot JSON unless migration generation or schema history requires debugging.
- Add custom data-migration SQL only when required, call it out explicitly, and keep Drizzle metadata generator-owned.
- Verify committed migrations against a fresh Testcontainers database.

### Database integration tests

- Run database integration tests against disposable Testcontainers infrastructure, never the development database.
- Apply committed migrations from an empty database before integration tests.
- Organize service integration tests by service method and name tests after business invariants.
- Use nested `describe` blocks only when they group multiple tests or clarify a meaningful scenario.
- Arrange existing state through pure fixtures and focused seed helpers that write directly through Drizzle, bypassing application repositories and services.
- Use only the service method under test as the action, then verify service-visible results and relevant persisted side effects independently.
- Build expected values from fixtures, explicit inputs, and controlled timestamps; do not copy the service result into the expected database value.
- Keep repository tests narrow and cover their persistence contract, ownership filtering, ordering, and non-trivial query behavior.
- Assert exact affected rows or constraint identifiers when identity and relational behavior matter.
- Deduplicate test mechanics, not business meaning; helpers must not hide the scenario being protected.

## Communication

- Respond in English unless Portuguese is explicitly requested.
- Report changes file by file with the reason and verification performed.
