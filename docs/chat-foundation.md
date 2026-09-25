# Chat foundation

The signed-in default route is `/chat`. `/chat/[conversationId]` reopens a saved
conversation. The header, sign-in and sign-up flows use the new default.

## Persistence

`conversation` stores ownership, a title derived from the first question, and
activity timestamps. `message` stores role, text, and a unique sequence within its
conversation. The first send creates the conversation; opening a blank chat does
not write an empty record. Deleting a conversation cascades to its messages.

The chat service reserves a question, assistant status message, and retrieval run
in one short transaction. It embeds and searches outside that transaction, then
records results or safe failure in another transaction. Generation streams
provisional text and saves its final answer, selected evidence IDs, metadata, and
safe failure state. Older `Answers coming later` messages remain historical
placeholders and must not become generation context.

The browser retains a message UUID across retries of the same draft. The service
locks the owned conversation before assigning sequence numbers. Concurrent sends
remain ordered pairs and duplicate submissions do not add messages. Inference failures
persist a failed run; retrying reuses its message IDs. A started run can be reclaimed
after one minute if interrupted. An execution ID rejects late completion from an
older attempt. Ownership is enforced in repository queries.

The chat loads the full conversation list and message history. Document selection,
retrieved evidence snapshots, timings, and safe retrieval errors are implemented.
Generation uses validated source labels, and the browser receives SSE from an
authenticated POST route. Pagination remains deferred. See
[retrieval.md](retrieval.md) for the current contract and limitations.

## UI

The chat alone uses a full-height layout without the site footer. Its composer
occupies a separate bottom row, so messages cannot be hidden underneath it.
Desktop history lives in a sidebar; mobile history opens in a keyboard-accessible
drawer. Long text wraps, Enter sends, Shift+Enter inserts a newline, and failed
sends retain the draft. Scrolling follows new messages only near the bottom or
after the user sends a message.
Completed answers render safe Markdown and link citations to compact source rows.
Opening a row reveals its saved excerpt. The source rows precede the full
retrieved candidate list. During generation, the UI shows plain provisional text
and a Stop control; completion replaces it with the saved answer. A disconnected
browser reloads persisted state and retries with the same message ID when needed.

## Document removal

Removal first marks the owned document `deleting`. The worker's existing status
predicates prevent it from claiming or completing that document. Retrieval filters
to `completed` documents. Chunk deletion cascades from the document, including stored
embeddings and saved retrieval evidence. History reads hide evidence from documents
in `deleting` state even before physical deletion finishes.

PDF cleanup removes the S3 object before deleting the database row. A failure
retains the storage key and `deleting` state. The document list exposes a manual
retry; there is no automatic cleanup scheduler. Missing objects are safe to delete
again. Text documents do not call object storage.

The service waits for the five-minute upload authorization window before removing
a recently created PDF. It retains the object during that window to prevent a
still-valid single-write URL from uploading it again. This is not cancellation of
an upload already in flight. Production storage should enforce upload request
limits and reconcile abandoned objects, including unusually long in-flight uploads.
Versioned buckets also require a separate noncurrent-version retention policy;
the adapter deletes the current key, not every historical version.

## Database rollout

Migration `0006_awesome_nighthawk.sql` is Drizzle-generated. Apply it with
`npm run db:migrate` before running the updated application. Integration tests apply
all migrations to a fresh disposable PostgreSQL/pgvector database. The migration was also applied to the configured localhost database after this
verification; browser test data remained in a separate disposable database.
