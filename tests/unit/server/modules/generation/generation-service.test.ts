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
            text: "Cancellations are allowed. [S1]", provider: "test-provider", requestedModel: "test-model",
            responseModel: "test-model", providerResponseId: "response-id", finishReason: "stop", httpStatus: 200,
            inputTokens: 20, outputTokens: 5, reasoningTokens: null, totalTokens: 25, latencyMs: 10,
        });
        const service = createGenerationService({ generateText }, { maxOutputTokens: 3072, timeoutMs: 60_000 });

        await service.generate("Can I cancel?", [chunk], "run-id", "attempt-id");

        expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 3072, timeoutMs: 60_000, traceId: "run-id", attemptId: "attempt-id",
        }));
    });

    it("rejects missing and unknown citations while retaining safe generation metadata", async () => {
        const chunk: RetrievedChunk = {
            chunkId: "chunk-id", documentId: "document-id", documentTitle: "Policy", revision: 1,
            ordinal: 0, pageNumber: null, text: "Cancellations are allowed.", rank: 1, semanticSimilarity: 0.9,
        };
        const metadata = {
            provider: "test-provider", requestedModel: "test-model", responseModel: "test-model",
            providerResponseId: "response-id", finishReason: "stop", httpStatus: 200,
            inputTokens: 20, outputTokens: 5, reasoningTokens: null, totalTokens: 25, latencyMs: 10,
        };
        for (const text of ["Cancellations are allowed.", "Cancellations are allowed. [S2]"]) {
            const service = createGenerationService({ async generateText() { return { ...metadata, text }; } });
            await expect(service.generate("Can I cancel?", [chunk])).rejects.toMatchObject({
                code: "invalid_citation", metadata: { providerResponseId: "response-id" },
            });
        }
    });

    it("accepts an exact abstention without a citation when retrieved evidence is insufficient", async () => {
        const chunk: RetrievedChunk = {
            chunkId: "chunk-id", documentId: "document-id", documentTitle: "Policy", revision: 1,
            ordinal: 0, pageNumber: null, text: "Unrelated details", rank: 1, semanticSimilarity: 0.2,
        };
        const service = createGenerationService({ async generateText() {
            return {
                text: "I cannot answer that from the available documents.", provider: "test", requestedModel: "test",
                responseModel: "test", providerResponseId: null, finishReason: "stop", httpStatus: 200,
                inputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, latencyMs: 1,
            };
        } });
        expect((await service.generate("Question", [chunk])).answer).toBe("I cannot answer that from the available documents.");
    });
});
