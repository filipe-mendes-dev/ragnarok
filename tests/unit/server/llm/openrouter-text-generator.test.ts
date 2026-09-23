import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterTextGenerator } from "@/server/llm/openrouter-text-generator";
import { GenerationError, type TextGenerationRequest } from "@/server/modules/generation/generation-contract";

const request: TextGenerationRequest = {
    messages: [{ role: "user", content: "Question" }],
    maxOutputTokens: 100,
    timeoutMs: 45_000,
    traceId: "run-id",
    attemptId: "attempt-id",
};

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("openRouterTextGenerator.generateText", () => {
    it("reports missing generation configuration before making a request", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", undefined);
        vi.stubEnv("GENERATION_MODEL", undefined);
        const fetcher = vi.fn<typeof fetch>();

        await expect(createOpenRouterTextGenerator(fetcher).generateText(request))
            .rejects.toEqual(new GenerationError("not_configured"));
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("sends the configured model and maps answer usage without exposing the key", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        vi.stubEnv("GENERATION_MODEL", "provider/cheap-model");
        let sent: RequestInit | undefined;
        const fetcher: typeof fetch = async (_input, init) => {
            sent = init;
            return Response.json({ id: "provider-response", model: "provider/cheap-model", choices: [{ finish_reason: "stop", message: { content: "  Grounded answer.  " } }], usage: { prompt_tokens: 25, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 }, total_tokens: 30 } });
        };

        const result = await createOpenRouterTextGenerator(fetcher).generateText(request);

        expect(JSON.parse(String(sent?.body))).toEqual({ model: "provider/cheap-model", messages: request.messages, max_tokens: 100, stream: false });
        expect(result).toMatchObject({ text: "Grounded answer.", requestedModel: "provider/cheap-model", responseModel: "provider/cheap-model", providerResponseId: "provider-response", finishReason: "stop", inputTokens: 25, outputTokens: 5, reasoningTokens: 2, totalTokens: 30 });
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(String(sent?.body)).not.toContain("private-key");
        expect(JSON.parse(String(vi.mocked(console.info).mock.calls[0]?.[0]))).toMatchObject({ event: "generation.openrouter", outcome: "completed", traceId: "run-id", attemptId: "attempt-id", providerResponseId: "provider-response" });
        expect(String(vi.mocked(console.info).mock.calls[0]?.[0])).not.toContain("Grounded answer");
        expect(String(vi.mocked(console.info).mock.calls[0]?.[0])).not.toContain("private-key");
    });

    it("records the finish reason and usage when the response limit cuts off an answer", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        vi.stubEnv("GENERATION_MODEL", "provider/model");
        const fetcher: typeof fetch = async () => Response.json({ id: "limited-response", model: "provider/model", choices: [{ finish_reason: "length", message: { content: "Partial answer" } }], usage: { completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 80 } } });

        await expect(createOpenRouterTextGenerator(fetcher).generateText(request))
            .rejects.toMatchObject({ code: "output_limit", metadata: { providerResponseId: "limited-response", finishReason: "length", outputTokens: 100, reasoningTokens: 80 } });
        expect(JSON.parse(String(vi.mocked(console.error).mock.calls[0]?.[0]))).toMatchObject({ outcome: "failed", errorCode: "output_limit", traceId: "run-id", finishReason: "length" });
        expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("Partial answer");
    });

    it("rejects an empty completed answer", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        vi.stubEnv("GENERATION_MODEL", "provider/model");
        const fetcher: typeof fetch = async () => Response.json({ model: "provider/model", choices: [{ finish_reason: "stop", message: { content: "  " } }] });

        await expect(createOpenRouterTextGenerator(fetcher).generateText(request))
            .rejects.toMatchObject({ code: "empty_response" });
    });

    it("logs invalid response fields without recording the response body", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        vi.stubEnv("GENERATION_MODEL", "provider/model");
        const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "private answer" } }] });

        await expect(createOpenRouterTextGenerator(fetcher).generateText(request))
            .rejects.toMatchObject({ code: "invalid_response" });
        expect(JSON.parse(String(vi.mocked(console.error).mock.calls[0]?.[0]))).toMatchObject({
            errorCode: "invalid_response", invalidFields: ["model"], httpStatus: 200,
        });
        expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("private answer");
    });

    it("turns provider failures into safe errors", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        vi.stubEnv("GENERATION_MODEL", "provider/model");
        const fetcher: typeof fetch = async () => new Response("private provider details", { status: 429 });
        await expect(createOpenRouterTextGenerator(fetcher).generateText(request))
            .rejects.toMatchObject({ code: "unavailable", metadata: { httpStatus: 429, requestedModel: "provider/model" } });
        expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("private provider details");
    });
});
