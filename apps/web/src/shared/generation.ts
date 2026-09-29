export interface GenerationRunView {
    traceId: string;
    attemptId: string;
    status: "started" | "completed" | "failed";
    retryable: boolean;
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
    errorCode: string | null;
    errorMessage: string | null;
}
