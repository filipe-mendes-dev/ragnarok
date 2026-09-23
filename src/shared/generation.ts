export interface GenerationRunView {
    status: "started" | "completed" | "failed";
    promptVersion: string;
    provider: string | null;
    requestedModel: string | null;
    responseModel: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
    errorMessage: string | null;
}
