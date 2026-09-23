import type { RetrievedChunk } from "@/shared/retrieval";
import { buildGenerationContext, GENERATION_PROMPT_VERSION } from "./generation-context";
import type { TextGenerator } from "./generation-contract";

const ABSTENTION = "I cannot answer that from the available documents.";
const MAX_OUTPUT_TOKENS = 512;

export interface GenerationResult {
    answer: string;
    promptVersion: string;
    selectedChunkIds: string[];
    provider: string | null;
    requestedModel: string | null;
    responseModel: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
}

export function createGenerationService(generator: TextGenerator) {
    async function generate(question: string, chunks: RetrievedChunk[]): Promise<GenerationResult> {
        const context = buildGenerationContext(question, chunks);
        if (context.selectedChunkIds.length === 0) {
            return {
                answer: ABSTENTION,
                promptVersion: GENERATION_PROMPT_VERSION,
                selectedChunkIds: [],
                provider: null,
                requestedModel: null,
                responseModel: null,
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
                latencyMs: null,
            };
        }
        const response = await generator.generateText({ messages: context.messages, maxOutputTokens: MAX_OUTPUT_TOKENS });
        return {
            answer: response.text,
            promptVersion: GENERATION_PROMPT_VERSION,
            selectedChunkIds: context.selectedChunkIds,
            provider: response.provider,
            requestedModel: response.requestedModel,
            responseModel: response.responseModel,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            totalTokens: response.totalTokens,
            latencyMs: response.latencyMs,
        };
    }
    return { generate };
}

export type GenerationService = ReturnType<typeof createGenerationService>;
