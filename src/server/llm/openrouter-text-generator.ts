import { z } from "zod";
import { getGenerationEnvironment } from "@/server/config/env";
import { GenerationError, type GenerationMetadata, type TextGenerator } from "@/server/modules/generation/generation-contract";

const responseSchema = z.object({
    id: z.string().min(1).optional(),
    model: z.string().min(1),
    choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable() }),
    })).min(1),
    usage: z.object({
        prompt_tokens: z.number().int().nonnegative().nullish(),
        completion_tokens: z.number().int().nonnegative().nullish(),
        completion_tokens_details: z.object({
            reasoning_tokens: z.number().int().nonnegative().nullish(),
        }).nullish(),
        total_tokens: z.number().int().nonnegative().nullish(),
    }).nullable().optional(),
});

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
                        stream: false,
                    }),
                    signal: AbortSignal.timeout(request.timeoutMs),
                    cache: "no-store",
                    redirect: "error",
                });
                metadata.httpStatus = response.status;
                if (!response.ok) throw new GenerationError("unavailable", metadata);
                const body: unknown = await response.json();
                const parsed = responseSchema.safeParse(body);
                if (!parsed.success) {
                    invalidFields = parsed.error.issues.map((issue) => issue.path.join("."));
                    throw new GenerationError("invalid_response", metadata);
                }
                const choice = parsed.data.choices[0];
                metadata.responseModel = parsed.data.model;
                metadata.providerResponseId = parsed.data.id ?? null;
                metadata.finishReason = choice?.finish_reason ?? null;
                metadata.inputTokens = parsed.data.usage?.prompt_tokens ?? null;
                metadata.outputTokens = parsed.data.usage?.completion_tokens ?? null;
                metadata.reasoningTokens = parsed.data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
                metadata.totalTokens = parsed.data.usage?.total_tokens ?? null;
                metadata.latencyMs = Math.round(performance.now() - started);
                const answer = choice?.message.content?.trim();
                if (choice?.finish_reason === "length") throw new GenerationError("output_limit", metadata);
                if (!answer) throw new GenerationError("empty_response", metadata);
                if (choice?.finish_reason !== "stop") throw new GenerationError("invalid_response", metadata);
                console.info(JSON.stringify({
                    event: "generation.openrouter",
                    outcome: "completed",
                    traceId: request.traceId ?? null,
                    attemptId: request.attemptId ?? null,
                    maxOutputTokens: request.maxOutputTokens,
                    ...metadata,
                }));
                return {
                    ...metadata,
                    text: answer,
                    responseModel: parsed.data.model,
                };
            } catch (error: unknown) {
                metadata.latencyMs = Math.round(performance.now() - started);
                const failure = error instanceof GenerationError
                    ? error
                    : new GenerationError(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "unavailable", metadata);
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
