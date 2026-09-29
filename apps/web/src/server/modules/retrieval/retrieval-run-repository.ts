import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { conversation, message } from '@/server/db/schema/conversations';
import { document } from '@/server/db/schema/documents';
import { retrievalCandidate, retrievalRun } from '@/server/db/schema/retrieval';
import type { RetrievalRunView, RetrievedChunk } from '@/shared/retrieval';
import { CHAT_STALE_ATTEMPT_MS } from '@/shared/chat';

type RunDatabase = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;
export type RetrievalRunRow = typeof retrievalRun.$inferSelect;

export function createRetrievalRunRepository(db: RunDatabase) {
    async function findForMessage(
        userId: string,
        messageId: string,
    ): Promise<RetrievalRunRow | null> {
        const [row] = await db
            .select({ run: retrievalRun })
            .from(retrievalRun)
            .innerJoin(message, eq(retrievalRun.messageId, message.id))
            .innerJoin(
                conversation,
                eq(message.conversationId, conversation.id),
            )
            .where(
                and(eq(message.id, messageId), eq(conversation.userId, userId)),
            );
        return row?.run ?? null;
    }
    async function listForConversation(
        userId: string,
        conversationId: string,
    ): Promise<Map<string, RetrievalRunView>> {
        const rows = await db
            .select({ run: retrievalRun })
            .from(retrievalRun)
            .innerJoin(message, eq(retrievalRun.messageId, message.id))
            .innerJoin(
                conversation,
                eq(message.conversationId, conversation.id),
            )
            .where(
                and(
                    eq(conversation.id, conversationId),
                    eq(conversation.userId, userId),
                ),
            );
        const result = new Map<string, RetrievalRunView>();
        if (rows.length === 0) return result;
        const candidates = await db
            .select({ candidate: retrievalCandidate })
            .from(retrievalCandidate)
            .innerJoin(document, eq(retrievalCandidate.documentId, document.id))
            .where(
                and(
                    inArray(
                        retrievalCandidate.runId,
                        rows.map(({ run }) => run.id),
                    ),
                    eq(document.userId, userId),
                    ne(document.status, 'deleting'),
                ),
            )
            .orderBy(asc(retrievalCandidate.rank));
        for (const { run } of rows) {
            result.set(run.responseMessageId, {
                id: run.id,
                messageId: run.messageId,
                status: run.status,
                retryable: run.status !== 'started' || Date.now() - run.startedAt.getTime() >= CHAT_STALE_ATTEMPT_MS,
                query: run.query,
                scope: run.scope,
                limit: run.limit,
                model: run.model,
                modelRevision: run.modelRevision,
                errorMessage: run.errorMessage,
                timings: run.timings,
                chunks: candidates
                    .filter(({ candidate }) => candidate.runId === run.id)
                    .map(({ candidate }) => ({
                        chunkId: candidate.chunkId,
                        documentId: candidate.documentId,
                        documentTitle: candidate.documentTitle,
                        revision: candidate.revision,
                        ordinal: candidate.ordinal,
                        pageNumber: candidate.pageNumber,
                        text: candidate.text,
                        rank: candidate.rank,
                        semanticSimilarity: candidate.semanticSimilarity,
                    })),
            });
        }
        return result;
    }
    async function listCandidatesForRun(userId: string, runId: string): Promise<RetrievedChunk[]> {
        const rows = await db.select({ candidate: retrievalCandidate }).from(retrievalCandidate)
            .innerJoin(retrievalRun, eq(retrievalCandidate.runId, retrievalRun.id))
            .innerJoin(message, eq(retrievalRun.messageId, message.id))
            .innerJoin(conversation, eq(message.conversationId, conversation.id))
            .innerJoin(document, eq(retrievalCandidate.documentId, document.id))
            .where(and(
                eq(retrievalCandidate.runId, runId),
                eq(conversation.userId, userId),
                eq(document.userId, userId),
                ne(document.status, 'deleting'),
            ))
            .orderBy(asc(retrievalCandidate.rank));
        return rows.map(({ candidate }) => ({
            chunkId: candidate.chunkId,
            documentId: candidate.documentId,
            documentTitle: candidate.documentTitle,
            revision: candidate.revision,
            ordinal: candidate.ordinal,
            pageNumber: candidate.pageNumber,
            text: candidate.text,
            rank: candidate.rank,
            semanticSimilarity: candidate.semanticSimilarity,
        }));
    }
    async function insert(
        input: typeof retrievalRun.$inferInsert,
    ): Promise<void> {
        await db.insert(retrievalRun).values(input);
    }
    async function update(
        id: string,
        values: Partial<
            Pick<
                RetrievalRunRow,
                | 'executionId'
                | 'status'
                | 'startedAt'
                | 'finishedAt'
                | 'errorMessage'
                | 'timings'
            >
        >,
    ): Promise<void> {
        await db
            .update(retrievalRun)
            .set(values)
            .where(eq(retrievalRun.id, id));
    }
    async function insertCandidates(
        userId: string,
        runId: string,
        chunks: RetrievedChunk[],
    ): Promise<void> {
        // The final transaction filters again in case a document was removed during retrieval.
        for (const chunk of chunks) {
            const [owned] = await db
                .select({ id: document.id })
                .from(document)
                .where(
                    and(
                        eq(document.id, chunk.documentId),
                        eq(document.userId, userId),
                        ne(document.status, 'deleting'),
                    ),
                )
                .for('share');
            if (owned)
                await db.insert(retrievalCandidate).values({ runId, ...chunk });
        }
    }
    return {
        findForMessage,
        listForConversation,
        listCandidatesForRun,
        insert,
        update,
        insertCandidates,
    };
}
