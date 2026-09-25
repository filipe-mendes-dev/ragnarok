export interface GenerationMessage {
    role: "system" | "user";
    content: string;
}

export interface TextGenerationRequest {
    messages: GenerationMessage[];
    maxOutputTokens: number;
    timeoutMs: number;
    traceId?: string;
    attemptId?: string;
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
}

export interface GenerationMetadata {
    provider: string;
    requestedModel: string;
    responseModel: string | null;
    providerResponseId: string | null;
    finishReason: string | null;
    httpStatus: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
    latencyMs: number;
}

export interface TextGenerationResponse extends GenerationMetadata {
    text: string;
    responseModel: string;
}

export interface TextGenerator {
    generateText(request: TextGenerationRequest): Promise<TextGenerationResponse>;
}

export type GenerationErrorCode = "not_configured" | "unavailable" | "timeout" | "invalid_response" | "output_limit" | "empty_response" | "invalid_citation" | "cancelled";

const generationErrorMessages: Record<GenerationErrorCode, string> = {
    not_configured: "Generation is not configured yet.",
    unavailable: "Generation is unavailable. Please retry.",
    timeout: "Generation timed out. Please retry.",
    invalid_response: "Generation returned an unusable answer. Please retry.",
    output_limit: "The answer exceeded its output limit. Try a shorter question.",
    empty_response: "The model returned no answer. Please retry.",
    invalid_citation: "The answer could not be linked to its sources. Please retry.",
    cancelled: "Generation was stopped. You can retry this question.",
};

export class GenerationError extends Error {
    constructor(
        public readonly code: GenerationErrorCode,
        public readonly metadata?: GenerationMetadata,
    ) {
        super(generationErrorMessages[code]);
        this.name = "GenerationError";
    }
}
