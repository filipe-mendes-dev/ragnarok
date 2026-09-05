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
- Add focused tests for business rules, authorization boundaries, retrieval behavior, and failure handling.
- Before finalizing implementation changes, run the relevant subset of `npm run check`, tests, and `npm run build`.
- Never commit secrets, `.env` files, uploaded documents, database volumes, or private evaluation data.
- Use Conventional Commit prefixes. Do not commit unless explicitly requested.
- No emoji in code comments.

## Communication

- Respond in English unless Portuguese is explicitly requested.
- Report changes file by file with the reason and verification performed.
