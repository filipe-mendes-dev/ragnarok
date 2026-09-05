# RAGnarok Product Requirements

## Document status

- Status: Draft approved for implementation planning
- Product version: V1 portfolio release
- Last updated: 2026-09-05

## Product summary

RAGnarok is a focused retrieval-augmented generation application. A signed-in user uploads private PDFs or submits text, observes asynchronous ingestion, asks questions against completed documents, receives grounded answers with inspectable citations, and opens a trace explaining how retrieval and generation produced each answer.

The product surface remains intentionally small. Its main differentiator is an understandable, observable, production-oriented RAG pipeline rather than a broad set of AI features.

## Goals

1. Ship a publicly accessible portfolio project in no more than two weeks.
2. Demonstrate credible full-stack, backend, deployment, RAG, and LLM engineering.
3. Make retrieval and generation behavior inspectable by a recruiter or technical interviewer.
4. Provide strong but truthful evidence for portfolio and CV claims.
5. Deepen understanding of the system through explicit runtime flows, failure tests, and evaluation.

## Primary user

The V1 user is an individual who wants to ask grounded questions about private documents and inspect how the system found and used evidence.

V1 has no organizations, teams, invitations, or workspace-management interface. Every private resource is owned directly by a user.

## Functional requirements

### Authentication and authorization

- **FR-01:** A user can sign in and sign out.
- **FR-02:** Application routes containing private data require an authenticated server-side identity.
- **FR-03:** A user can access only documents, chunks, conversations, messages, and traces owned by that user.
- **FR-04:** Authorization constraints are applied inside document and retrieval queries, not only in an earlier request-layer check.

### Document management

- **FR-05:** A user can upload a text-based PDF.
- **FR-06:** A user can submit plain text as a document.
- **FR-07:** A user can edit a submitted text document.
- **FR-08:** PDF content cannot be edited in V1.
- **FR-09:** Saving edited text starts complete asynchronous re-ingestion because chunk boundaries and embeddings may change.
- **FR-10:** A user can list and delete owned documents.
- **FR-11:** Original PDF bytes are stored in S3-compatible object storage; PostgreSQL stores their metadata and processing state.
- **FR-12:** Submitted text may be stored in PostgreSQL as application content.

### Asynchronous ingestion

- **FR-13:** Upload and text-submission requests do not wait for parsing, chunking, embedding, or indexing to finish.
- **FR-14:** A user can observe the document states `uploaded`, `queued`, `processing`, `completed`, and `failed`.
- **FR-15:** A failed document exposes a safe, useful error summary and can be retried.
- **FR-16:** Only completed documents participate in retrieval.
- **FR-17:** Ingestion supports bounded retries and safe duplicate job execution.

### Question answering

- **FR-18:** A user can ask a question against all completed owned documents or a selected subset.
- **FR-19:** Retrieval and generation remain separate application boundaries.
- **FR-20:** V1 first supports semantic retrieval using query embeddings and pgvector.
- **FR-21:** Retrieval supports explicit metadata constraints, including selected document IDs and user ownership.
- **FR-22:** The system later adds PostgreSQL lexical retrieval and a simple observable fusion strategy after semantic retrieval works end to end.
- **FR-23:** Reranking is optional and may be deferred if it threatens deployment.
- **FR-24:** Generated answers use only supplied evidence, cite source locations, and abstain when the available evidence is insufficient.
- **FR-25:** A citation maps to an owned document, source location or page where available, chunk, and evidence text.
- **FR-26:** A user can reopen previous questions, answers, citations, and traces.

### RAG observability

- **FR-27:** Every question creates a trace ID.
- **FR-28:** A trace records the query, applied filters, models, prompt version, stage latencies, selected context, token usage, final status, and safe error details.
- **FR-29:** Candidate records expose semantic, lexical, fusion, and reranking information when those stages are enabled.
- **FR-30:** The trace identifies which chunks were selected for final context and their document/page metadata.
- **FR-31:** The public debug experience does not expose secrets, private provider reasoning, or unsafe hidden information.

### Evaluation

- **FR-32:** The project includes a small evaluation dataset of approximately 15 to 30 gold questions.
- **FR-33:** Evaluation covers practical signals such as expected-source retrieval, recall at k, citation correctness, expected facts, abstention, latency, and token usage.
- **FR-34:** Any LLM-as-a-judge result is treated as a fallible signal rather than objective ground truth.

## Non-functional requirements

### Security and privacy

- **NFR-01:** User isolation is enforced at every persistence and retrieval boundary.
- **NFR-02:** PostgreSQL, Redis, and internal application ports are not publicly exposed in production.
- **NFR-03:** Secrets are supplied at runtime and are not committed to Git or stored in traces.
- **NFR-04:** Uploaded content and document instructions are treated as untrusted data.

### Reliability

- **NFR-05:** PostgreSQL is the authoritative source for persistent document and application state; Redis is not long-term state storage.
- **NFR-06:** Background jobs use bounded attempts, timeouts, retry backoff, and idempotent persistence behavior where practical.
- **NFR-07:** Expected failures end in explicit states rather than hanging or silently disappearing.
- **NFR-08:** Replacement chunks for edited text are committed atomically after new chunks and embeddings are ready.
- **NFR-09:** Services support graceful shutdown and appropriate restart policies in production.

### Performance and limits

- **NFR-10:** The system targets low-to-moderate portfolio-demo traffic on one VPS with approximately 4 CPU cores and 8 GB RAM.
- **NFR-11:** Typical question latency should be approximately five seconds or less when external providers respond normally.
- **NFR-12:** The default PDF upload limit is 10 MB and is configurable without a code change.
- **NFR-13:** Parsing also uses bounded execution and extracted-content limits because compressed file size alone is not a sufficient safety boundary.

### Observability and maintainability

- **NFR-14:** Application and worker logs are structured and correlate work using request, document, job, or trace identifiers.
- **NFR-15:** Prompt construction, retrieval, context construction, and generation are explicit, typed, and independently testable modules.
- **NFR-16:** CI eventually runs installation, linting, type checking, tests, and a production build.
- **NFR-17:** The deployed application is accessible over HTTPS and exposes a health endpoint suitable for deployment verification.

### Deployment constraints

- **NFR-18:** Production uses Docker Compose on a single VPS.
- **NFR-19:** Nginx terminates HTTPS and may balance traffic across two instances of the same stateless application image.
- **NFR-20:** Two application containers on one VPS demonstrate application-level load balancing but do not claim machine-level high availability.

## Core entities

- **User:** Authentication identity and direct owner of private resources.
- **Document:** PDF or text source, ownership, metadata, source location/content, processing state, and safe failure details.
- **Document chunk:** Ordered text segment, page/source metadata, lexical representation, embedding, and owning document relationship.
- **Conversation:** User-owned grouping of questions and answers.
- **Message:** User question or generated answer within a conversation.
- **Retrieval run:** Per-question execution trace and aggregate stage information.
- **Retrieval candidate:** A chunk observed during retrieval, fusion, reranking, or final selection, with relevant ranks and scores.

An ingestion-run entity may be added if durable attempt history is needed beyond BullMQ job data and the document's current state. It is not required merely to mirror the retrieval model.

## State models

```text
document:
uploaded -> queued -> processing -> completed
                            \----> failed
```

```text
retrieval run:
started -> retrieving -> generating -> completed
     \-----------------------------> failed
```

## Critical runtime rules

### PDF ingestion

```text
authorize user
-> validate PDF and limits
-> store original bytes in object storage
-> insert document metadata
-> enqueue ingestion job
-> worker extracts text
-> worker chunks and embeds text
-> worker stores chunks and vectors
-> mark document completed
```

### Text editing

```text
authorize document ownership
-> update source text
-> mark document queued
-> enqueue complete re-ingestion
-> create replacement chunks and embeddings
-> atomically replace old chunks
-> mark document completed
```

Old chunks remain stored until replacements are ready, preventing premature data loss. Because retrieval accepts only completed documents, stale chunks are not used while re-ingestion is queued, processing, or failed.

### Question answering

```text
authenticate user
-> validate requested filters
-> embed query
-> retrieve only chunks joined to documents owned by the user
-> optionally run lexical retrieval and fusion
-> optionally rerank
-> construct bounded, cited context
-> generate or abstain
-> validate citations
-> persist answer and trace
```

## Explicit V1 non-goals

- Organizations, teams, invitations, and shared workspaces
- OCR for scanned PDFs
- URL or web ingestion
- File formats other than PDF and submitted plain text
- Multiple named knowledge bases per user
- PDF editing
- Agents, autonomous research, LangGraph, and MCP
- Microservices and elaborate event-driven architecture
- Kafka, RabbitMQ, NATS, Kubernetes, and Terraform
- PostgreSQL or Redis high-availability clusters
- Billing, subscriptions, public sharing, and complex account management
- Custom email infrastructure
- Native mobile applications
- A large evaluation platform or custom-trained reranker

## Success criteria

The V1 product is complete when a recruiter can:

1. Open the deployed application over HTTPS.
2. Sign in and access private data.
3. Upload a PDF or submit text.
4. Observe asynchronous processing and failure states.
5. Ask a question against completed documents.
6. Receive a grounded answer with inspectable citations.
7. Inspect the candidates, filters, context, timings, models, and usage behind the answer.
8. Understand the system and deployment architecture from project documentation.

The project stops expanding when these criteria are met.

## Open product decisions

- Authentication provider or library
- Embedding and generation providers and models
- Production object-storage provider
- Exact PDF page and extracted-content limits
- Whether reranking fits before the deployment milestone
- Whether the public deployment offers self-service accounts or a controlled demo account
