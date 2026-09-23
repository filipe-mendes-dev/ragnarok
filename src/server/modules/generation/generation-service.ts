import type { RetrievedChunk } from "@/shared/retrieval";
import { getGenerationSettings, type GenerationSettings } from "@/server/config/env";
import { buildGenerationContext, GENERATION_PROMPT_VERSION } from "./generation-context";
import type { TextGenerator } from "./generation-contract";

const ABSTENTION = "I cannot answer that from the available documents.";

export interface GenerationResult {
    answer: string;
    promptVersion: string;
    selectedChunkIds: string[];
    provider: string | null;
    requestedModel: string | null;
    responseModel: string | null;
    providerResponseId: string | null;
    finishReason: string | null;
    httpStatus: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
}

export function createGenerationService(generator: TextGenerator, settings: GenerationSettings = getGenerationSettings()) {
    async function generate(question: string, chunks: RetrievedChunk[], traceId?: string, attemptId?: string): Promise<GenerationResult> {
        const context = buildGenerationContext(question, chunks);
        if (context.selectedChunkIds.length === 0) {
            return {
                answer: ABSTENTION,
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
            };
        }
        const response = await generator.generateText({
            messages: context.messages,
            maxOutputTokens: settings.maxOutputTokens,
            timeoutMs: settings.timeoutMs,
            ...(traceId ? { traceId } : {}),
            ...(attemptId ? { attemptId } : {}),
        });
        return {
            answer: response.text,
            promptVersion: GENERATION_PROMPT_VERSION,
            selectedChunkIds: context.selectedChunkIds,
            provider: response.provider,
            requestedModel: response.requestedModel,
            responseModel: response.responseModel,
            providerResponseId: response.providerResponseId,
            finishReason: response.finishReason,
            httpStatus: response.httpStatus,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            reasoningTokens: response.reasoningTokens,
            totalTokens: response.totalTokens,
            latencyMs: response.latencyMs,
        };
    }
    return { generate };
}

export type GenerationService = ReturnType<typeof createGenerationService>;
