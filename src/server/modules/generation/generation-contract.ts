export interface GenerationMessage {
    role: "system" | "user";
    content: string;
}

export interface TextGenerationRequest {
    messages: GenerationMessage[];
    maxOutputTokens: number;
}

export interface TextGenerationResponse {
    text: string;
    provider: string;
    requestedModel: string;
    responseModel: string;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number;
}

export interface TextGenerator {
    generateText(request: TextGenerationRequest): Promise<TextGenerationResponse>;
}

export class GenerationError extends Error {
    constructor(public readonly code: "not_configured" | "unavailable" | "invalid_response") {
        super(code === "not_configured"
            ? "Generation is not configured yet."
            : code === "invalid_response"
                ? "Generation returned an unusable answer. Please retry."
                : "Generation is unavailable. Please retry.");
        this.name = "GenerationError";
    }
}
