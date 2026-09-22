import { randomUUID } from 'node:crypto';
import type { Database } from '@/server/db/client';
import { createChatRepository } from '@/server/modules/chat/chat-repository';
import {
    parseConversationId,
    parseSendMessageInput,
} from '@/server/modules/chat/chat-input';
import { createRetrievalRunRepository } from '@/server/modules/retrieval/retrieval-run-repository';
import {
    createRetrievalService,
    type RetrievalService,
} from '@/server/modules/retrieval/retrieval-service';
import {
    EMBEDDING_MODEL,
    EMBEDDING_REVISION,
    RETRIEVAL_LIMIT,
    RetrievalError,
} from '@/server/modules/retrieval/retrieval-contract';
import type {
    ChatMessage,
    ConversationSummary,
    SendMessageInput,
} from '@/shared/chat';
import type { RetrievalResult } from '@/shared/retrieval';

export class ChatError extends Error {}
const GENERATION_NOTICE =
    'Generation is not implemented yet. Retrieved chunks are shown below.';

export function createChatService(
    db: Database,
    retrieval: RetrievalService = createRetrievalService(db),
) {
    const repository = createChatRepository(db);
    async function listConversations(
        userId: string,
    ): Promise<ConversationSummary[]> {
        return repository.listForUser(userId);
    }
    async function getConversation(
        userId: string,
        id: string,
    ): Promise<{ title: string; messages: ChatMessage[] } | null> {
        const row = await repository.findForUser(
            userId,
            parseConversationId(id),
        );
        if (!row) return null;
        const runs = await createRetrievalRunRepository(db).listForConversation(
            userId,
            id,
        );
        const messages = await repository.listMessagesForUser(userId, id);
        return {
            title: row.title,
            messages: messages.map((message) => {
                const retrieval = runs.get(message.id);
                return {
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    ...(retrieval ? { retrieval } : {}),
                };
            }),
        };
    }
    async function sendMessage(
        userId: string,
        rawInput: SendMessageInput,
    ): Promise<void> {
        if (!userId.trim()) throw new ChatError('Sign in to send a message');
        const input = parseSendMessageInput(rawInput);
        const executionId = randomUUID();
        const run = await db.transaction(async (tx) => {
            const records = createChatRepository(tx);
            const runs = createRetrievalRunRepository(tx);
            await records.insertConversation({
                id: input.conversationId,
                userId,
                title: input.content.slice(0, 80),
            });
            const owned = await records.lockForUser(
                userId,
                input.conversationId,
            );
            if (!owned) throw new ChatError('Conversation not found');
            const history = await records.listMessagesForUser(
                userId,
                input.conversationId,
            );

            const existing = history.find((row) => row.id === input.messageId);

            if (existing) {
                if (
                    existing.role !== 'user' ||
                    existing.content !== input.content
                )
                    throw new ChatError(
                        'This message was already sent with different content',
                    );
                const previous = await runs.findForMessage(
                    userId,
                    input.messageId,
                );
                if (!previous) return null;
                if (
                    JSON.stringify(previous.scope) !==
                    JSON.stringify(input.scope)
                )
                    throw new ChatError(
                        'This message was already sent with a different document selection',
                    );
                if (previous.status === 'completed') return null;
                if (
                    previous.status === 'started' &&
                    Date.now() - previous.startedAt.getTime() < 60_000
                ) {
                    throw new ChatError(
                        'Retrieval is still running. Wait a moment, then retry.',
                    );
                }
                await runs.update(previous.id, {
                    executionId,
                    status: 'started',
                    startedAt: new Date(),
                    finishedAt: null,
                    errorMessage: null,
                    timings: null,
                });
                await records.updateMessage(
                    userId,
                    previous.responseMessageId,
                    'Retrieving chunks…',
                );
                return {
                    id: previous.id,
                    responseMessageId: previous.responseMessageId,
                };
            }
            const sequence = (history.at(-1)?.sequence ?? -1) + 1;
            const responseMessageId = randomUUID();
            await records.insertMessages([
                {
                    id: input.messageId,
                    conversationId: input.conversationId,
                    role: 'user',
                    content: input.content,
                    sequence,
                },
                {
                    id: responseMessageId,
                    conversationId: input.conversationId,
                    role: 'assistant',
                    content: 'Retrieving chunks…',
                    sequence: sequence + 1,
                },
            ]);
            const id = randomUUID();
            await runs.insert({
                id,
                messageId: input.messageId,
                responseMessageId,
                executionId,
                status: 'started',
                query: input.content,
                scope: input.scope,
                limit: RETRIEVAL_LIMIT,
                model: EMBEDDING_MODEL,
                modelRevision: EMBEDDING_REVISION,
            });

            await records.updateActivity(userId, input.conversationId);
            return { id, responseMessageId };
        });

        if (!run) return;
        const started = performance.now();
        let result: RetrievalResult | null = null;
        let errorMessage: string | null = null;
        try {
            result = await retrieval.retrieve(userId, {
                query: input.content,
                scope: input.scope,
            });
        } catch (error: unknown) {
            errorMessage =
                error instanceof RetrievalError
                    ? error.message
                    : 'Retrieval failed. Please retry.';
        }
        await db.transaction(async (tx) => {
            const records = createChatRepository(tx);
            if (!(await records.lockForUser(userId, input.conversationId)))
                return;
            const runs = createRetrievalRunRepository(tx);
            const current = await runs.findForMessage(userId, input.messageId);
            if (!current || current.executionId !== executionId) return;
            if (result)
                await runs.insertCandidates(userId, run.id, result.chunks);
            await runs.update(run.id, {
                status: result ? 'completed' : 'failed',
                finishedAt: new Date(),
                errorMessage,
                timings: result?.timings ?? {
                    embeddingMs: null,
                    searchMs: null,
                    totalMs: Math.round(performance.now() - started),
                },
            });
            await records.updateMessage(
                userId,
                run.responseMessageId,
                result
                    ? GENERATION_NOTICE
                    : `Generation is not implemented yet. ${errorMessage}`,
            );
            await records.updateActivity(userId, input.conversationId);
        });
        if (errorMessage) throw new ChatError(errorMessage);
    }
    async function deleteConversation(
        userId: string,
        id: string,
    ): Promise<void> {
        await repository.deleteForUser(userId, parseConversationId(id));
    }
    return {
        listConversations,
        getConversation,
        sendMessage,
        deleteConversation,
    };
}
