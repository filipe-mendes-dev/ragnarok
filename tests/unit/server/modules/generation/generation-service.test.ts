import { describe, expect, it, vi } from "vitest";
import { createGenerationService } from "@/server/modules/generation/generation-service";
import type { TextGenerator } from "@/server/modules/generation/generation-contract";
import type { RetrievedChunk } from "@/shared/retrieval";

describe("generationService.generate", () => {
    it("abstains without evidence and does not call a provider", async () => {
        const generateText = vi.fn<TextGenerator["generateText"]>();
        const service = createGenerationService({ generateText });

        expect(await service.generate("Unknown question", [])).toMatchObject({
            answer: "I cannot answer that from the available documents.",
            selectedChunkIds: [],
            provider: null,
        });
        expect(generateText).not.toHaveBeenCalled();
    });

    it("passes configured limits and run identifiers to the provider", async () => {
        const chunk: RetrievedChunk = {
            chunkId: "chunk-id", documentId: "document-id", documentTitle: "Policy", revision: 1,
            ordinal: 0, pageNumber: null, text: "Cancellations are allowed.", rank: 1, semanticSimilarity: 0.9,
        };
        const generateText = vi.fn<TextGenerator["generateText"]>().mockResolvedValue({
            text: "Cancellations are allowed.", provider: "test-provider", requestedModel: "test-model",
            responseModel: "test-model", providerResponseId: "response-id", finishReason: "stop", httpStatus: 200,
            inputTokens: 20, outputTokens: 5, reasoningTokens: null, totalTokens: 25, latencyMs: 10,
        });
        const service = createGenerationService({ generateText }, { maxOutputTokens: 3072, timeoutMs: 60_000 });

        await service.generate("Can I cancel?", [chunk], "run-id", "attempt-id");

        expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 3072, timeoutMs: 60_000, traceId: "run-id", attemptId: "attempt-id",
        }));
    });
});
