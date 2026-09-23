import { z } from "zod";
import { getGenerationEnvironment } from "@/server/config/env";
import { GenerationError, type TextGenerator } from "@/server/modules/generation/generation-contract";

const responseSchema = z.object({
    model: z.string().min(1),
    choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable() }),
    })).min(1),
    usage: z.object({
        prompt_tokens: z.number().int().nonnegative().optional(),
        completion_tokens: z.number().int().nonnegative().optional(),
        total_tokens: z.number().int().nonnegative().optional(),
    }).nullable().optional(),
});

export function createOpenRouterTextGenerator(fetcher: typeof fetch = fetch): TextGenerator {
    return {
        async generateText(request) {
            const environment = getGenerationEnvironment();
            if (!environment) throw new GenerationError("not_configured");
            const started = performance.now();
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
                    signal: AbortSignal.timeout(20_000),
                    cache: "no-store",
                    redirect: "error",
                });
                if (!response.ok) throw new GenerationError("unavailable");
                const body: unknown = await response.json();
                const parsed = responseSchema.safeParse(body);
                if (!parsed.success) throw new GenerationError("invalid_response");
                const choice = parsed.data.choices[0];
                const answer = choice?.message.content?.trim();
                if (!answer || choice?.finish_reason !== "stop") throw new GenerationError("invalid_response");
                return {
                    text: answer,
                    provider: "openrouter",
                    requestedModel: environment.GENERATION_MODEL,
                    responseModel: parsed.data.model,
                    inputTokens: parsed.data.usage?.prompt_tokens ?? null,
                    outputTokens: parsed.data.usage?.completion_tokens ?? null,
                    totalTokens: parsed.data.usage?.total_tokens ?? null,
                    latencyMs: Math.round(performance.now() - started),
                };
            } catch (error: unknown) {
                if (error instanceof GenerationError) throw error;
                throw new GenerationError("unavailable");
            }
        },
    };
}
