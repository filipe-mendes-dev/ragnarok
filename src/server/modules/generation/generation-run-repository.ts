import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { conversation, message } from "@/server/db/schema/conversations";
import { generationRun } from "@/server/db/schema/generation";
import { retrievalRun } from "@/server/db/schema/retrieval";
import type { GenerationRunView } from "@/shared/generation";

type GenerationRunDatabase = Pick<Database, "select" | "insert" | "update">;
export type GenerationRunRow = typeof generationRun.$inferSelect;

export function createGenerationRunRepository(db: GenerationRunDatabase) {
    async function findForRetrievalRun(userId: string, retrievalRunId: string): Promise<GenerationRunRow | null> {
        const [row] = await db.select({ run: generationRun }).from(generationRun)
            .innerJoin(retrievalRun, eq(generationRun.retrievalRunId, retrievalRun.id))
            .innerJoin(message, eq(retrievalRun.messageId, message.id))
            .innerJoin(conversation, eq(message.conversationId, conversation.id))
            .where(and(eq(generationRun.retrievalRunId, retrievalRunId), eq(conversation.userId, userId)));
        return row?.run ?? null;
    }

    async function listForConversation(userId: string, conversationId: string): Promise<Map<string, GenerationRunView>> {
        const rows = await db.select({ run: generationRun, responseMessageId: retrievalRun.responseMessageId })
            .from(generationRun)
            .innerJoin(retrievalRun, eq(generationRun.retrievalRunId, retrievalRun.id))
            .innerJoin(message, eq(retrievalRun.messageId, message.id))
            .innerJoin(conversation, eq(message.conversationId, conversation.id))
            .where(and(eq(conversation.id, conversationId), eq(conversation.userId, userId)));
        return new Map(rows.map(({ run, responseMessageId }) => [responseMessageId, {
            status: run.status,
            promptVersion: run.promptVersion,
            provider: run.provider,
            requestedModel: run.requestedModel,
            responseModel: run.responseModel,
            inputTokens: run.inputTokens,
            outputTokens: run.outputTokens,
            totalTokens: run.totalTokens,
            latencyMs: run.latencyMs,
            errorMessage: run.errorMessage,
        }]));
    }

    async function insert(input: typeof generationRun.$inferInsert): Promise<void> {
        await db.insert(generationRun).values(input);
    }

    async function update(retrievalRunId: string, values: Partial<Pick<GenerationRunRow,
        "executionId" | "status" | "promptVersion" | "selectedChunkIds" | "provider" |
        "requestedModel" | "responseModel" | "inputTokens" | "outputTokens" | "totalTokens" |
        "latencyMs" | "errorMessage" | "startedAt" | "finishedAt"
    >>): Promise<void> {
        await db.update(generationRun).set(values).where(eq(generationRun.retrievalRunId, retrievalRunId));
    }

    return { findForRetrievalRun, listForConversation, insert, update };
}
