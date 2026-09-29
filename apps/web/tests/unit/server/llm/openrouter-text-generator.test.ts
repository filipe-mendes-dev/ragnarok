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

function frame(payload: unknown): string {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

function chunk(content: string, finishReason: string | null = null, usage?: object): object {
    return {
        id: "provider-response",
        model: "provider/model",
        choices: [{ delta: { content }, finish_reason: finishReason }],
        ...(usage ? { usage } : {}),
    };
}

function responseFromStream(text: string, fragmentSize = 9): Response {
    const bytes = new TextEncoder().encode(text);
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            for (let offset = 0; offset < bytes.length; offset += fragmentSize) {
                controller.enqueue(bytes.slice(offset, offset + fragmentSize));
            }
            controller.close();
        },
    }), { headers: { "Content-Type": "text/event-stream" } });
}

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("OPENROUTER_API_KEY", "private-key");
    vi.stubEnv("GENERATION_MODEL", "provider/model");
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

    it("streams fragmented text, ignores keepalive comments, and records final usage", async () => {
        let sent: RequestInit | undefined;
        const onDelta = vi.fn<(text: string) => void>();
        const fetcher: typeof fetch = async (_input, init) => {
            sent = init;
            return responseFromStream(
                ": OPENROUTER PROCESSING\n\n" +
                frame(chunk("Grounded ")) +
                frame(chunk("answer. [S1]", "stop")) +
                frame(chunk("", "stop", { prompt_tokens: 25, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 }, total_tokens: 30 })) +
                "data: [DONE]\n\n",
                3,
            );
        };

        const result = await createOpenRouterTextGenerator(fetcher).generateText({ ...request, onDelta });

        expect(JSON.parse(String(sent?.body))).toEqual({ model: "provider/model", messages: request.messages, max_tokens: 100, stream: true });
        expect(onDelta.mock.calls.map(([text]) => text)).toEqual(["Grounded ", "answer. [S1]"]);
        expect(result).toMatchObject({ text: "Grounded answer. [S1]", providerResponseId: "provider-response", finishReason: "stop", inputTokens: 25, outputTokens: 5, reasoningTokens: 2, totalTokens: 30 });
        expect(String(vi.mocked(console.info).mock.calls[0]?.[0])).not.toContain("Grounded answer");
        expect(String(vi.mocked(console.info).mock.calls[0]?.[0])).not.toContain("private-key");
    });

    it("rejects an output limit after emitting partial text", async () => {
        const onDelta = vi.fn<(text: string) => void>();
        const fetcher: typeof fetch = async () => responseFromStream(frame(chunk("Partial answer", "length")) + "data: [DONE]\n\n");

        await expect(createOpenRouterTextGenerator(fetcher).generateText({ ...request, onDelta }))
            .rejects.toMatchObject({ code: "output_limit", metadata: { finishReason: "length" } });
        expect(onDelta).toHaveBeenCalledWith("Partial answer");
        expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("Partial answer");
    });

    it("rejects empty and truncated completed responses", async () => {
        const empty: typeof fetch = async () => responseFromStream(frame(chunk("  ", "stop")) + "data: [DONE]\n\n");
        await expect(createOpenRouterTextGenerator(empty).generateText(request)).rejects.toMatchObject({ code: "empty_response" });
        const truncated: typeof fetch = async () => responseFromStream(frame(chunk("Partial", "stop")));
        await expect(createOpenRouterTextGenerator(truncated).generateText(request)).rejects.toMatchObject({ code: "invalid_response" });
    });

    it("rejects malformed frames and provider errors without logging answer text", async () => {
        const malformed: typeof fetch = async () => responseFromStream(frame({ choices: [{ delta: null }] }) + "data: [DONE]\n\n");
        await expect(createOpenRouterTextGenerator(malformed).generateText(request)).rejects.toMatchObject({ code: "invalid_response" });
        const providerError: typeof fetch = async () => responseFromStream(frame({ ...chunk(""), error: { message: "private provider detail" } }));
        await expect(createOpenRouterTextGenerator(providerError).generateText(request)).rejects.toMatchObject({ code: "unavailable" });
        expect(vi.mocked(console.error).mock.calls.map(([entry]) => String(entry)).join(" ")).not.toContain("private provider detail");
    });

    it("turns HTTP provider failures into safe errors", async () => {
        const fetcher: typeof fetch = async () => new Response("private provider details", { status: 429 });
        await expect(createOpenRouterTextGenerator(fetcher).generateText(request))
            .rejects.toMatchObject({ code: "unavailable", metadata: { httpStatus: 429, requestedModel: "provider/model" } });
        expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("private provider details");
    });

    it("classifies a stopped request as cancellation", async () => {
        const abort = new AbortController();
        abort.abort();
        const fetcher: typeof fetch = async () => { throw new DOMException("stopped", "AbortError"); };
        await expect(createOpenRouterTextGenerator(fetcher).generateText({ ...request, signal: abort.signal }))
            .rejects.toMatchObject({ code: "cancelled" });
    });
});
