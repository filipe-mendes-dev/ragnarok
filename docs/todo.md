# RAGnarok backlog

Last updated: 2026-09-21

Record deferred work here when it is agreed. The [roadmap](roadmap.md) owns phase
order; this file owns the details of follow-ups. An unchecked item is unfinished,
not a promise that it belongs in the current branch. Add the reason and a concrete
completion condition. Mark items complete only with implementation and verification.

Text and PDF ingestion work locally, with user-confirmed UI testing. Continue with
Phase 5 embeddings and retrieval, then grounded answers. The work below does not
block starting Phase 5 unless explicitly stated.

## Before public deployment

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

## Ingestion quality and later decisions

- [ ] **Evaluate chunk settings with retrieval.** Current defaults are 1,000 Unicode
  code points and 150 target overlap. Review a representative corpus and retrieval
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
