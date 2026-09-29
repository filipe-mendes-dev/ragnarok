import { randomUUID } from "node:crypto";
import type { Database } from "@/server/db/client";
import { createGenerationRunRepository } from "@/server/modules/generation/generation-run-repository";
import { GENERATION_PROMPT_VERSION } from "@/server/modules/generation/generation-context";
import { GenerationError } from "@/server/modules/generation/generation-contract";
import type { GenerationResult, GenerationService } from "@/server/modules/generation/generation-service";
import { createRetrievalRunRepository } from "@/server/modules/retrieval/retrieval-run-repository";
import type { RetrievalService } from "@/server/modules/retrieval/retrieval-service";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, RETRIEVAL_LIMIT, RetrievalError } from "@/server/modules/retrieval/retrieval-contract";
import { CHAT_STALE_ATTEMPT_MS, type ChatMessage, type ChatStreamEvent, type ConversationSummary, type SendMessageInput } from "@/shared/chat";
import type { RetrievalResult } from "@/shared/retrieval";
import { parseConversationId, parseSendMessageInput } from "./chat-input";
import { createChatRepository } from "./chat-repository";

export class ChatError extends Error {}

interface ChatDependencies {
    retrieval: RetrievalService;
    generation: GenerationService;
}

interface ActiveAttempt {
    runId: string;
    responseMessageId: string;
    stage: "retrieval" | "generation";
}

interface SendMessageOptions {
    onEvent?: (event: ChatStreamEvent) => void;
    signal?: AbortSignal;
}

export function createChatService(db: Database, dependencies: ChatDependencies) {
    const repository = createChatRepository(db);
    const retrievalRunRepository = createRetrievalRunRepository(db);
    const generationRunRepository = createGenerationRunRepository(db);

    async function listConversations(userId: string): Promise<ConversationSummary[]> {
        return repository.listForUser(userId);
    }

    async function getConversation(userId: string, id: string): Promise<{ title: string; messages: ChatMessage[] } | null> {
        const conversationId = parseConversationId(id);
        const row = await repository.findForUser(userId, conversationId);
        if (!row) return null;
        const [retrievalRuns, generationRuns, messages] = await Promise.all([
            retrievalRunRepository.listForConversation(userId, conversationId),
            generationRunRepository.listForConversation(userId, conversationId),
            repository.listMessagesForUser(userId, conversationId),
        ]);
        return {
            title: row.title,
            messages: messages.map((message) => {
                const retrieval = retrievalRuns.get(message.id);
                const generation = generationRuns.get(message.id);
                return {
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    ...(retrieval ? { retrieval } : {}),
                    ...(generation ? { generation } : {}),
                };
            }),
        };
    }

    async function sendMessage(userId: string, rawInput: unknown, options: SendMessageOptions = {}): Promise<void> {
        if (!userId.trim()) throw new ChatError("Sign in to send a message");
        const input = parseSendMessageInput(rawInput);
        const executionId = randomUUID();
        const attempt = await beginAttempt(userId, input, executionId);
        if (!attempt) {
            options.onEvent?.({ type: "completed", content: null });
            return;
        }
        options.onEvent?.({ type: "accepted", messageId: input.messageId, responseMessageId: attempt.responseMessageId, stage: attempt.stage });
        if (attempt.stage === "retrieval") {
            const shouldGenerate = await completeRetrieval(userId, input, attempt, executionId);
            if (!shouldGenerate) {
                options.onEvent?.({ type: "completed", content: null });
                return;
            }
            options.onEvent?.({ type: "stage", stage: "generation" });
        }
        const content = await completeGeneration(userId, input, attempt, executionId, options);
        options.onEvent?.({ type: "completed", content });
    }

    async function beginAttempt(
        userId: string,
        input: ReturnType<typeof parseSendMessageInput>,
        executionId: string,
    ): Promise<ActiveAttempt | null> {
        return db.transaction(async (tx): Promise<ActiveAttempt | null> => {
            const records = createChatRepository(tx);
            const retrievalRuns = createRetrievalRunRepository(tx);
            const generationRuns = createGenerationRunRepository(tx);
            await records.insertConversation({
                id: input.conversationId,
                userId,
                title: input.content.slice(0, 80),
            });
            if (!(await records.lockForUser(userId, input.conversationId))) {
                throw new ChatError("Conversation not found");
            }
            const history = await records.listMessagesForUser(userId, input.conversationId);
            const existing = history.find((row) => row.id === input.messageId);

            if (existing) {
                if (existing.role !== "user" || existing.content !== input.content) {
                    throw new ChatError("This message was already sent with different content");
                }
                const previous = await retrievalRuns.findForMessage(userId, input.messageId);
                if (!previous) return null;
                if (JSON.stringify(previous.scope) !== JSON.stringify(input.scope)) {
                    throw new ChatError("This message was already sent with a different document selection");
                }

                if (previous.status === "completed") {
                    const generation = await generationRuns.findForRetrievalRun(userId, previous.id);
                    if (generation?.status === "completed") return null;
                    if (generation?.status === "started" && Date.now() - generation.startedAt.getTime() < CHAT_STALE_ATTEMPT_MS) {
                        throw new ChatError("Generation is still running. Wait a moment, then retry.");
                    }
                    if (generation) {
                        await generationRuns.update(previous.id, {
                            executionId,
                            status: "started",
                            promptVersion: GENERATION_PROMPT_VERSION,
                            selectedChunkIds: [],
                            provider: null,
                            requestedModel: null,
                            responseModel: null,
                            providerResponseId: null,
                            finishReason: null,
                            httpStatus: null,
                            inputTokens: null,
                            outputTokens: null,
                            reasoningTokens: null,
                            totalTokens: null,
                            latencyMs: null,
                            errorCode: null,
                            errorMessage: null,
                            startedAt: new Date(),
                            finishedAt: null,
                        });
                    } else {
                        await generationRuns.insert({
                            retrievalRunId: previous.id,
                            executionId,
                            status: "started",
                            promptVersion: GENERATION_PROMPT_VERSION,
                        });
                    }
                    await records.updateMessage(userId, previous.responseMessageId, "Generating answer…");
                    return { runId: previous.id, responseMessageId: previous.responseMessageId, stage: "generation" };
                }

                if (previous.status === "started" && Date.now() - previous.startedAt.getTime() < CHAT_STALE_ATTEMPT_MS) {
                    throw new ChatError("Retrieval is still running. Wait a moment, then retry.");
                }
                await retrievalRuns.update(previous.id, {
                    executionId,
                    status: "started",
                    startedAt: new Date(),
                    finishedAt: null,
                    errorMessage: null,
                    timings: null,
                });
                await records.updateMessage(userId, previous.responseMessageId, "Retrieving chunks…");
                return { runId: previous.id, responseMessageId: previous.responseMessageId, stage: "retrieval" };
            }

            const sequence = (history.at(-1)?.sequence ?? -1) + 1;
            const responseMessageId = randomUUID();
            await records.insertMessages([
                { id: input.messageId, conversationId: input.conversationId, role: "user", content: input.content, sequence },
                { id: responseMessageId, conversationId: input.conversationId, role: "assistant", content: "Retrieving chunks…", sequence: sequence + 1 },
            ]);
            const runId = randomUUID();
            await retrievalRuns.insert({
                id: runId,
                messageId: input.messageId,
                responseMessageId,
                executionId,
                status: "started",
                query: input.content,
                scope: input.scope,
                limit: RETRIEVAL_LIMIT,
                model: EMBEDDING_MODEL,
                modelRevision: EMBEDDING_REVISION,
            });
            await records.updateActivity(userId, input.conversationId);
            return { runId, responseMessageId, stage: "retrieval" };
        });
    }

    async function completeRetrieval(
        userId: string,
        input: SendMessageInput & { scope: NonNullable<SendMessageInput["scope"]> },
        attempt: ActiveAttempt,
        executionId: string,
    ): Promise<boolean> {
        const started = performance.now();
        let result: RetrievalResult | null = null;
        let errorMessage: string | null = null;
        try {
            result = await dependencies.retrieval.retrieve(userId, { query: input.content, scope: input.scope });
        } catch (error: unknown) {
            errorMessage = error instanceof RetrievalError ? error.message : "Retrieval failed. Please retry.";
        }
        const shouldGenerate = await db.transaction(async (tx) => {
            const records = createChatRepository(tx);
            if (!(await records.lockForUser(userId, input.conversationId))) return false;
            const retrievalRuns = createRetrievalRunRepository(tx);
            const current = await retrievalRuns.findForMessage(userId, input.messageId);
            if (!current || current.executionId !== executionId) return false;
            if (result) await retrievalRuns.insertCandidates(userId, attempt.runId, result.chunks);
            await retrievalRuns.update(attempt.runId, {
                status: result ? "completed" : "failed",
                finishedAt: new Date(),
                errorMessage,
                timings: result?.timings ?? {
                    embeddingMs: null,
                    searchMs: null,
                    totalMs: Math.round(performance.now() - started),
                },
            });
            if (result) {
                await createGenerationRunRepository(tx).insert({
                    retrievalRunId: attempt.runId,
                    executionId,
                    status: "started",
                    promptVersion: GENERATION_PROMPT_VERSION,
                });
                await records.updateMessage(userId, attempt.responseMessageId, "Generating answer…");
            } else {
                await records.updateMessage(userId, attempt.responseMessageId, errorMessage ?? "Retrieval failed. Please retry.");
            }
            await records.updateActivity(userId, input.conversationId);
            return result !== null;
        });
        if (errorMessage) throw new ChatError(errorMessage);
        return shouldGenerate;
    }

    async function completeGeneration(
        userId: string,
        input: SendMessageInput,
        attempt: ActiveAttempt,
        executionId: string,
        options: SendMessageOptions,
    ): Promise<string | null> {
        const chunks = await retrievalRunRepository.listCandidatesForRun(userId, attempt.runId);
        const started = performance.now();
        let result: GenerationResult | null = null;
        let generationError: GenerationError | null = null;
        let errorCode: string | null = null;
        let errorMessage: string | null = null;
        try {
            if (options.signal?.aborted) throw new GenerationError("cancelled");
            result = await dependencies.generation.generate(input.content, chunks, attempt.runId, executionId, {
                ...(options.signal ? { signal: options.signal } : {}),
                ...(options.onEvent ? { onDelta: (text) => options.onEvent?.({ type: "delta", text }) } : {}),
            });
            if (options.signal?.aborted) throw new GenerationError("cancelled");
        } catch (error: unknown) {
            result = null;
            if (error instanceof GenerationError) {
                generationError = error;
                errorCode = error.code;
            } else {
                console.error(JSON.stringify({
                    event: "generation.workflow",
                    outcome: "failed",
                    traceId: attempt.runId,
                    attemptId: executionId,
                    errorCode: "unexpected",
                    causeName: error instanceof Error ? error.name : typeof error,
                }));
            }
            errorMessage = generationError?.message ?? "Generation failed. Please retry.";
        }
        const observation = result ?? generationError?.metadata;
        const persisted = await db.transaction(async (tx) => {
            const records = createChatRepository(tx);
            if (!(await records.lockForUser(userId, input.conversationId))) return false;
            const generationRuns = createGenerationRunRepository(tx);
            const current = await generationRuns.findForRetrievalRun(userId, attempt.runId);
            if (!current || current.executionId !== executionId) return false;
            if (options.signal?.aborted && result) {
                result = null;
                errorCode = "cancelled";
                errorMessage = "Generation was stopped. You can retry this question.";
            }
            if (result && result.selectedChunkIds.length > 0) {
                const available = await createRetrievalRunRepository(tx).listCandidatesForRun(userId, attempt.runId);
                const availableIds = new Set(available.map((chunk) => chunk.chunkId));
                if (result.selectedChunkIds.some((id) => !availableIds.has(id))) {
                    result = null;
                    errorCode = "document_changed";
                    errorMessage = "A document changed while generating the answer. Please retry.";
                }
            }
            await generationRuns.update(attempt.runId, {
                status: result ? "completed" : "failed",
                finishedAt: new Date(),
                errorCode: result ? null : errorCode ?? "unexpected",
                errorMessage,
                selectedChunkIds: result?.selectedChunkIds ?? [],
                provider: observation?.provider ?? null,
                requestedModel: observation?.requestedModel ?? null,
                responseModel: observation?.responseModel ?? null,
                providerResponseId: observation?.providerResponseId ?? null,
                finishReason: observation?.finishReason ?? null,
                httpStatus: observation?.httpStatus ?? null,
                inputTokens: observation?.inputTokens ?? null,
                outputTokens: observation?.outputTokens ?? null,
                reasoningTokens: observation?.reasoningTokens ?? null,
                totalTokens: observation?.totalTokens ?? null,
                latencyMs: result ? result.latencyMs : observation?.latencyMs ?? Math.round(performance.now() - started),
            });
            await records.updateMessage(userId, attempt.responseMessageId, result?.answer ?? errorMessage ?? "Generation failed. Please retry.");
            await records.updateActivity(userId, input.conversationId);
            return true;
        });
        if (errorMessage) throw new ChatError(errorMessage);
        return persisted ? result?.answer ?? null : null;
    }

    async function deleteConversation(userId: string, id: string): Promise<void> {
        await repository.deleteForUser(userId, parseConversationId(id));
    }

    return { listConversations, getConversation, sendMessage, deleteConversation };
}
