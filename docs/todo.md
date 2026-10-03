# RAGnarok backlog

Last updated: 2026-09-30

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

- [ ] **Evaluate chunk settings with retrieval.** Current ingestion defaults are 1,000
  Unicode characters and 150 target overlap. Review a representative corpus and retrieval
  results before claiming these values are optimal.
- [ ] **Broaden PDF extraction fixtures.** The selected golden pages favor
  PyMuPDF `sort=False` for the inspected columns; add synthetic positioned-word,
  column, and table examples to check reading order beyond those pages. Do not
  commit personal PDFs.
- [ ] **Record extraction provenance.** Decide how parser version/mode and future
  normalization changes are recorded alongside chunk configuration so reprocessing
  is explainable. Existing chunks are not automatically rebuilt after code changes.
- [ ] **Decide whether durable ingestion history is needed.** Current PostgreSQL
  state and console logs are not an attempt history. RabbitMQ removes acknowledged
  messages; its dashboard is not a completed-job audit trail.

## Job extension: inspection and human-led workflow

This work belongs to the separate `apps/job-extension` product path, not the web
application's two-week V1 scope. The public [ElevenLabs Ashby posting](https://jobs.ashbyhq.com/elevenlabs/ada7cd2c-8b9f-4f19-a88b-7c2ca1be1fde)
is the first concrete fixture: Overview and Application use different same-origin
routes. The form has both an optional resume upload for autofill and a separate
required Resume upload. The Overview exposes an "Apply for this Job" link to the
form; the form exposes a separate "Submit Application" button.

At the 2026-10-03 checkpoint, the implemented baseline includes plain-text context
capture with retry/skip, field/action scanning, name/email/file form recognition,
and bounded LangGraph discovery with manual pause/resume. The extension uses the
existing web account and a Next.js/OpenRouter action-selection fallback. The
[extension guide](../apps/job-extension/README.md) records setup and verification;
the [tutorial](job-extension-tutorial.md) follows the code. The items below describe
remaining coverage and refinements, rather than an unimplemented baseline.

- [ ] **Reject unrelated captured context.** Keep the current simple text reader;
  add an acceptance rule requiring at least two distinct job-description keyword
  groups, initially role overview, responsibilities, requirements, and qualifications.
  Inspect rejected captures before refining the rule. Empty or rejected context
  should retain the existing retry/skip decision.
- [ ] **Make learned action expressions manageable.** Current learning saves only
  an unknown manual choice after the next scan finds a form, scoped to its origin.
  Define editable/deletable global expressions and save only after confirmed
  submission before replacing that policy. Submission is not implemented yet.

- [ ] **Build a representative inspection fixture set.** Capture sanitized DOM
  structure and expected controls, labels, required states, actions, and job text
  from this Ashby page and at least one other application site. Exclude applicant
  values and files. Measure missed fields, wrong associations, and extra results
  before expanding heuristics.
- [ ] **Recognize upload controls and their triggers.** Associate a hidden file
  input with a visible HTML label, button, or drop zone when the relationship is
  supported by the DOM. Record `accept`, `multiple`, required status, and evidence
  without reading selected files. Distinguish Ashby's autofill upload from its
  required Resume field in the inspection result.
- [ ] **Broaden the control inventory only where fixtures require it.** Check
  editable regions, ARIA textboxes, custom selects, open shadow roots, and embedded
  frames as separate cases. Classify hidden page-state inputs and unrelated page
  controls so they do not become application questions. Verify coverage and false
  positives for each new detector.
- [ ] **Preserve field and requirement evidence.** Keep explicit labels, group
  headings, descriptions, nearby text, and upload-trigger associations as distinct
  candidates. Record whether "required" came from native/ARIA metadata, visible
  text, or validation feedback. Show uncertain or conflicting matches for review;
  do not promote nearby text to an explicit label.
- [ ] **Map navigation and form actions.** Add semantic tabs, links, disclosure
  controls, and upload triggers to the action inventory. Distinguish opening an
  application from final submission. Treat `tabindex`, pointer styling, or inline
  click attributes as weak clues; no DOM scan can enumerate all delegated event
  handlers. Verify each suggested action against the resulting page state.
- [ ] **Refine bounded job context when needed.** The baseline already preserves
  a description string, source URL, and capture time. Structured title, company,
  location, and headed sections remain future refinements. Exclude
  navigation, footer, repeated text, and applicant-entered values. Preserve the
  source URL and capture time so the form step can use the earlier description.
- [x] **Move the inspector UI to a side panel.** The toolbar icon opens the React
  panel, which keeps the manual scan and displays the last result while open.
- [ ] **Verify multi-step panel behavior across sites.** The panel already shows
  context, graph steps, field evidence, and manual selection. Per-tab session
  storage retains context; graph checkpoints last only while the panel is open.
  Check real same-origin route changes, closure/reopening, and lost `activeTab`
  access before adding durable graph recovery or cross-origin continuation.
- [ ] **Evaluate model fallback for unresolved labels.** Send a small, sanitized
  DOM-derived neighborhood for only unresolved fields, batched by page, with stable
  field IDs. Compare a small text model with a cropped image plus DOM evidence when
  visual layout matters. Measure token use, latency, false associations, and
  whether a stronger model improves the same fixtures. Reject unknown field IDs
  and expose model suggestions as uncertain until reviewed.

## Job extension: later answer and autonomous workflow

- [ ] **Define the private application profile.** Store verified facts and
  preferred CV versions with source provenance and an explicit selection policy.
  Add authenticated API routes that return only the facts needed for a specific
  application; keep provider credentials and private retrieval on the server.
- [ ] **Draft answers with bounded model use.** Retrieve known facts first. Use
  a small model only for question matching or minor wording changes, and evaluate
  a stronger model for genuinely open-ended answers. When a cover-letter field is
  present, always prepare a job-specific draft under the user's chosen policy.
  Verify generated claims against profile evidence and keep job-posting text as
  untrusted request context rather than a profile fact.
- [ ] **Implement supervised filling before automatic submission.** Fill fields
  confirmed required by the site, plus an available cover-letter field. Select the
  preferred CV, handle newly revealed questions and validation errors, and show
  the user the filled form before submission. Stop on unknown required status,
  missing facts, or ambiguous controls. Test that rescan and retry do not duplicate
  changes.
- [ ] **Evaluate end-to-end autonomous applications.** Once the supervised path
  passes multi-site fixtures, define a user-approved policy for which jobs may
  receive automatic CV selection, navigation, filling, and final submission. Use
  bounded state transitions with post-action checks; distinguish "Apply" from "Submit
  Application", stop on uncertainty, detect completion, and prevent duplicate
  submissions. Record an auditable summary of actions, answers, sources, cost, and
  failures without persisting unnecessary page or applicant data.

## After V1 learning

- [ ] Compare alternative parsers on the same corpus. OCR remains outside V1.
- [ ] Explore per-user chunk settings and alternative chunk sets after evaluation.
- [ ] Build a bounded document-search tool-calling exercise, then use LangGraph
  when branching, checkpoints, or human approval justify it. Agents remain outside V1.
