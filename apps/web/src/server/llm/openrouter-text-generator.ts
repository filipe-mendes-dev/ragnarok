import { createParser } from "eventsource-parser";
import { z } from "zod";
import { getGenerationEnvironment } from "@/server/config/env";
import { GenerationError, type GenerationMetadata, type TextGenerator, type TextGenerationRequest } from "@/server/modules/generation/generation-contract";

const usageSchema = z.object({
    prompt_tokens: z.number().int().nonnegative().nullish(),
    completion_tokens: z.number().int().nonnegative().nullish(),
    completion_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().nullish() }).nullish(),
    total_tokens: z.number().int().nonnegative().nullish(),
});

const chunkSchema = z.object({
    id: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        delta: z.object({ content: z.string().nullable().optional() }),
    })).min(1),
    usage: usageSchema.nullish(),
    error: z.unknown().optional(),
});

function requestSignal(request: TextGenerationRequest): AbortSignal {
    const timeout = AbortSignal.timeout(request.timeoutMs);
    return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout;
}

export function createOpenRouterTextGenerator(fetcher: typeof fetch = fetch): TextGenerator {
    return {
        async generateText(request) {
            const environment = getGenerationEnvironment();
            if (!environment) {
                console.error(JSON.stringify({ event: "generation.openrouter", outcome: "failed", traceId: request.traceId ?? null, attemptId: request.attemptId ?? null, errorCode: "not_configured" }));
                throw new GenerationError("not_configured");
            }
            const started = performance.now();
            const metadata: GenerationMetadata = {
                provider: "openrouter",
                requestedModel: environment.GENERATION_MODEL,
                responseModel: null,
                providerResponseId: null,
                finishReason: null,
                httpStatus: null,
                inputTokens: null,
                outputTokens: null,
                reasoningTokens: null,
                totalTokens: null,
                latencyMs: 0,
            };
            let invalidFields: string[] | null = null;
            try {
                const response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${environment.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: environment.GENERATION_MODEL,
                        messages: request.messages,
                        max_tokens: request.maxOutputTokens,
                        stream: true,
                    }),
                    signal: requestSignal(request),
                    cache: "no-store",
                    redirect: "error",
                });
                metadata.httpStatus = response.status;
                if (!response.ok) throw new GenerationError("unavailable", metadata);
                if (!response.body) throw new GenerationError("invalid_response", metadata);

                let answer = "";
                let completed = false;
                const parser = createParser({
                    onEvent(event) {
                        if (event.data === "[DONE]") {
                            completed = true;
                            return;
                        }
                        let payload: unknown;
                        try {
                            payload = JSON.parse(event.data) as unknown;
                        } catch {
                            throw new GenerationError("invalid_response", metadata);
                        }
                        const parsed = chunkSchema.safeParse(payload);
                        if (!parsed.success) {
                            invalidFields = parsed.error.issues.map((issue) => issue.path.join("."));
                            throw new GenerationError("invalid_response", metadata);
                        }
                        const chunk = parsed.data;
                        if (chunk.error !== undefined) throw new GenerationError("unavailable", metadata);
                        if (chunk.id) metadata.providerResponseId = chunk.id;
                        if (chunk.model) metadata.responseModel = chunk.model;
                        const choice = chunk.choices[0];
                        if (choice?.finish_reason) metadata.finishReason = choice.finish_reason;
                        const delta = choice?.delta.content;
                        if (delta) {
                            answer += delta;
                            request.onDelta?.(delta);
                        }
                        if (chunk.usage) {
                            metadata.inputTokens = chunk.usage.prompt_tokens ?? null;
                            metadata.outputTokens = chunk.usage.completion_tokens ?? null;
                            metadata.reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens ?? null;
                            metadata.totalTokens = chunk.usage.total_tokens ?? null;
                        }
                    },
                });
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                try {
                    while (true) {
                        const next = await reader.read();
                        if (next.done) break;
                        parser.feed(decoder.decode(next.value, { stream: true }));
                    }
                    parser.feed(decoder.decode());
                } finally {
                    if (!completed) await reader.cancel().catch(() => {});
                    reader.releaseLock();
                }
                metadata.latencyMs = Math.round(performance.now() - started);
                if (!completed || !metadata.responseModel) throw new GenerationError("invalid_response", metadata);
                if (metadata.finishReason === "length") throw new GenerationError("output_limit", metadata);
                if (!answer.trim()) throw new GenerationError("empty_response", metadata);
                if (metadata.finishReason !== "stop") throw new GenerationError("invalid_response", metadata);
                console.info(JSON.stringify({
                    event: "generation.openrouter",
                    outcome: "completed",
                    traceId: request.traceId ?? null,
                    attemptId: request.attemptId ?? null,
                    maxOutputTokens: request.maxOutputTokens,
                    ...metadata,
                }));
                return { ...metadata, text: answer.trim(), responseModel: metadata.responseModel };
            } catch (error: unknown) {
                metadata.latencyMs = Math.round(performance.now() - started);
                const failure = error instanceof GenerationError
                    ? error
                    : new GenerationError(request.signal?.aborted ? "cancelled" : error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "unavailable", metadata);
                console.error(JSON.stringify({
                    event: "generation.openrouter",
                    outcome: "failed",
                    traceId: request.traceId ?? null,
                    attemptId: request.attemptId ?? null,
                    maxOutputTokens: request.maxOutputTokens,
                    ...metadata,
                    errorCode: failure.code,
                    invalidFields,
                    causeName: error instanceof GenerationError ? null : error instanceof Error ? error.name : typeof error,
                }));
                throw failure;
            }
        },
    };
}
