# RAGnarok backlog

Last updated: 2026-09-25

Record deferred work here when it is agreed. The [roadmap](roadmap.md) owns phase
order; this file owns the details of follow-ups. An unchecked item is unfinished,
not a promise that it belongs in the current branch. Add the reason and a concrete
completion condition. Mark items complete only with implementation and verification.

Text and PDF ingestion work locally, with user-confirmed UI testing. Semantic
retrieval and plain answer generation also work locally. The work below remains
deferred unless explicitly stated.

## Before public deployment

- [ ] **Harden the chat stream request boundary.** The route checks the session,
  and the chat service checks resource ownership. The origin check accepts a
  missing Origin header and compares hosts only. Define the allowed origin
  policy for the deployed HTTPS proxy, including forwarded-host handling. Test
  unauthenticated, cross-origin, and cross-user requests through that configuration.
- [ ] **Limit chat generation usage.** Set per-user request and concurrent-stream
  limits, plus a practical generation budget. Enforce them across both web
  containers so a signed-in client cannot bypass them by choosing an instance.
  Verify rejection and recovery without charging for requests that never start.
- [ ] **Recover missing publications.** Saving a source and publishing to RabbitMQ
  are separate commits. Choose an outbox or reconciliation approach and verify
  that a crash or broker outage cannot leave uploaded/queued work stranded.
  Include a deliberate backfill path for existing documents with no message.
- [ ] **Persist retry exhaustion.** Attempts currently reset on redelivery/restart.
  Bound attempts across restarts, distinguish permanent configuration errors from
  transient outages, and persist a safe terminal failure without a retry loop.
- [ ] **Support explicit ingestion retry.** Add an authorized retry action/UI with
  revision checks and a defined policy for completed documents needing reprocessing.
- [ ] **Supervise worker shutdown and restart.** Add production restart policies,
  graceful drain, resource limits, and checks for pending work with no consumer.
  Verify interrupted work can resume without duplicate persisted chunks.
- [ ] **Expand fault and contract tests.** Existing service and real-broker tests
  cover useful outcomes. Add worker termination, broker loss, uncertain publication,
  and shared valid/invalid message fixtures exercised by TypeScript and Python.
- [ ] **Deploy operational observability.** Agree JSON fields, correlation IDs,
  severity, retention, access, and collection within the VPS budget. Add metrics,
  propagated trace context, and alerts for failures, backlog, and stuck documents.
  Prove a failure can be diagnosed without exposing source content or credentials.
  Keep current verbose INFO logs for now; revisit DEBUG levels during this work.
- [ ] **Verify operational recovery.** Check infrastructure persistence across
  restarts, dependency readiness, migration application before starting consumers,
  and backup/restore procedures. A static web liveness response is not readiness.

## Remaining V1 document features

- [ ] **Edit text and re-ingest.** Increment the revision, queue replacement work,
  reject stale results, and test cross-user access and concurrent processing.
- [ ] **Delete owned documents and stored PDFs.** Define recovery when object
  deletion fails, test ownership, and preserve safe handling of obsolete messages.

## Answer citations

- [x] Return source identifiers with generated answers, validate each identifier
  against selected evidence, and link them to saved chunk snapshots. Deleted
  documents leave an unavailable source label in historical answers.

## Conversation streaming

- [x] **Stream assistant responses.** An authenticated POST route relays SSE
  events while the chat service owns durable messages and retries. The UI shows
  provisional text, supports Stop, handles explicit completion/errors, and reloads
  saved state after a disconnect. Reused message IDs prevent duplicate messages;
  focused tests compare the completion event with the persisted answer.
- [ ] **Review chat service generation workflow naming and size.**
  `completeGeneration` both calls the generation service and persists the attempt
  outcome, so its name suggests a narrower responsibility. In a later branch,
  rename it to describe the full workflow and assess whether extracting focused
  service helpers makes the retry and persistence steps easier to follow. Keep
  workflow decisions and transaction ownership in the service, and verify the
  existing success, failure, cancellation, and retry behavior after any refactor.
- [ ] **Verify production streaming.** Check incremental delivery and cancellation
  through the planned Nginx load balancer and both web containers. Configure HTTPS,
  stream buffering, timeouts, and request limits, then verify that completed and
  aborted streams behave as expected. Its configuration is not in this repository yet.

## Conversation presentation and scale

- [x] **Render assistant answers as Markdown.** Completed answers show paragraphs,
  lists, emphasis, and code. Raw HTML and images are disabled; model links remain
  plain text. Validated citation labels link to saved evidence. The stored answer
  remains unchanged, and provisional streamed text stays plain until completion.
- [ ] **Review chat on narrow screens.** Verify long answers, document titles,
  source excerpts, and the composer at 320px in a signed-in browser session.
- [ ] **Virtualize long conversations.** Measure rendering with a representative
  long history, then render only the visible messages if needed. Preserve scroll
  position, scroll-to-latest behavior, keyboard access, and variable-height answers
  or expanded retrieval details. Verify the behavior on small screens.

## Ingestion quality and later decisions

- [ ] **Evaluate chunk settings with retrieval.** Current ingestion defaults are 384 BGE
  content tokens and 48 target overlap. Review a representative corpus and retrieval
  results before claiming these values are optimal.
- [ ] **Broaden PDF extraction fixtures.** Layout mode fixes the inspected letter;
  add synthetic positioned-word, column, and table examples to check reading order.
  Do not commit personal PDFs. Compare parsers only when examples justify it.
- [ ] **Record extraction provenance.** Decide how parser version/mode and future
  normalization changes are recorded alongside chunk configuration so reprocessing
  is explainable. Existing chunks are not automatically rebuilt after code changes.
- [ ] **Decide whether durable ingestion history is needed.** Current PostgreSQL
  state and console logs are not an attempt history. RabbitMQ removes acknowledged
  messages; its dashboard is not a completed-job audit trail.

## After V1 learning

- [ ] Compare alternative parsers on the same corpus. OCR remains outside V1.
- [ ] Explore per-user chunk settings and alternative chunk sets after evaluation.
- [ ] Build a bounded document-search tool-calling exercise, then use LangGraph
  when branching, checkpoints, or human approval justify it. Agents remain outside V1.
