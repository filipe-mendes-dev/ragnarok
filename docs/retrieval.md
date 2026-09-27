# Semantic retrieval

## Current behavior

Chat uses the latest user message as a standalone retrieval query. History
is not embedded or rewritten. Messages retain their 10,000-character limit.
OpenRouter validates each query against the embedding model's 8,192-token input
limit; the application does not silently truncate it.
An invalid query produces a failed retrieval run and retains the composer draft.

Next.js calls OpenRouter's `/embeddings` endpoint, then performs exact cosine
search in PostgreSQL. All queries constrain document ownership, completed status,
current source revision, non-null vectors, and the configured embedding model/revision.
Users choose all eligible documents or an explicit nonempty subset. An unavailable
selection fails without broadening scope. Selection validation and search share a
repeatable-read snapshot after inference. The database determines eligibility at
that snapshot, not when the HTTP request first arrives.

The server currently returns five chunks, ordered by cosine distance and chunk ID
for ties. `RETRIEVAL_LIMIT` is the server-side setting. There is no HNSW index,
lexical search, similarity cutoff, reranking, diversity selection, or context builder.
A nearest result is not proof of relevance or sufficient evidence. Cosine similarity
is displayed as a score, never a confidence percentage.

Generation builds a versioned prompt from the saved, owned retrieval
snapshots. It includes whole excerpts in rank order up to a 12,000-character context
budget. If none fit, the service abstains without calling OpenRouter. Otherwise the
server sends the question and excerpts to the configured `GENERATION_MODEL` through
OpenRouter. Selected excerpts receive contiguous `[S1]`, `[S2]`, and later labels.
The prompt asks for cited Markdown or an exact abstention. The service rejects
missing or out-of-range labels, but it does not validate factual support. The UI
shows cited source snapshots before the full retrieval trace. Deleted source
snapshots produce unavailable labels in historical answers.

OpenRouter and the browser-facing POST route use SSE. The provider adapter gathers
the full response, finish reason, and final usage while forwarding text increments.
The browser displays provisional plain text, then reloads the saved answer and
renders its Markdown and validated citation links. Stream errors and cancellation
end in safe persisted failure states; a disconnected browser reloads durable state
and can retry the same message ID.

## Embedding provider

Next.js and the Python ingestion worker independently call OpenRouter's embeddings
endpoint with `openai/text-embedding-3-small` and `dimensions: 1536`. Both use
`OPENROUTER_API_KEY`. The Python worker batches document chunks and validates
provider response indices, dimensions, and finite nonzero values. The TypeScript
query adapter validates its single vector. OpenRouter may return the upstream
model name without the `openai/` prefix, so both adapters accept that response
name while recording the requested OpenRouter slug. Both record
`openrouter-1536-v1` as the application configuration revision. No Python HTTP
embedding service runs in the application.

The Python chunker uses 1,000 Unicode characters per chunk with a 150-character
target overlap. These limits are configured in `worker/src/ragnarok_ingestion/embedding.py`.
The larger model input limit does not change the citation
or generation context budgets. Requests have bounded timeouts and provider errors
produce safe failures. `OPENROUTER_EMBEDDINGS_URL` is available for local test
servers; production uses OpenRouter's public endpoint.

## Persistence and retry

Drizzle migration `0007_huge_wong.sql` adds retrieval runs and candidate snapshots.
Chat first reserves the user/assistant pair and retrieval run under the owned
conversation lock. Retrieval and generation run outside database transactions.
One short transaction saves retrieval candidates and starts a separate generation
run. Another saves the answer in the assistant message and generation status,
prompt version, selected chunk IDs, model identity, token usage, and latency when
available. Failures retain safe messages without exposing provider response bodies.

A retry uses the same question ID and canonical document scope. Completed retrieval
does not repeat after a generation failure; generation retries from owned evidence
snapshots. Completed answers are idempotent. Interrupted started stages can be
reclaimed after one minute, with a new execution ID preventing a late attempt from
overwriting its replacement. There is no automatic recovery scheduler. The UI offers
retry and refreshes active histories.

Evidence snapshots preserve text/title/page/revision after re-ingestion replaces
chunks. Deleting a document cascades its evidence snapshots; history also hides
snapshots as soon as deletion is pending. The final save rejects an answer when its
selected source is no longer available at that check. Deleting a conversation cascades
messages, runs, and candidates. Answers with source labels and generation metadata
are persisted; the UI derives links from the saved selected chunk IDs and owned
candidate snapshots.

## Regression benchmark

`tests/evaluation/retrieval-corpus.ts` defines eight synthetic documents, sixteen
fixed passages, twelve answerable questions, and one unsupported question. It
contains no private data. The opt-in benchmark measures source ranking with the
current OpenRouter embedding model and PostgreSQL retrieval, using fixed passage boundaries. It does not
evaluate the ingestion chunker, arbitrary PDFs, domain adaptation, or generation.
Annotations refer to stable source keys, not generated chunk UUIDs.

From the repository root, with Docker and `OPENROUTER_API_KEY` configured:

```bash
RUN_LIVE_EMBEDDING_EVALUATION=1 \
  RETRIEVAL_EVALUATION_REPORT=/private/tmp/ragnarok-retrieval-evaluation.json \
  npm run test:integration -- tests/integration/server/modules/retrieval/retrieval-evaluation.test.ts
```

The test calls OpenRouter and starts a disposable migrated database. It is skipped
by default so normal integration tests do not use credits. The
report includes source recall at five, reciprocal rank, timings, and retrieved
source keys per question. Unsupported questions are reported but excluded from
answerable recall and rank averages; without a rejection mechanism, they still
return nearest chunks. No universal quality threshold is claimed. The initial
assertions only establish a functioning benchmark, not acceptable domain quality.
A future specialized application needs its own representative, held-out cases.

Historical BGE baseline on 2026-09-22: source recall at five was 1.0 and mean reciprocal
rank was 1.0 across the twelve answerable cases. Retrieval took 15–32 ms for those
cases with a warm local BGE model and this sixteen-passage corpus. The unsupported
student-discount question still returned five chunks, as expected without a cutoff.
The complete example report is [retrieval-baseline.json](retrieval-baseline.json).
These easy synthetic cases establish a regression reference, not general quality
or a VPS latency claim.
