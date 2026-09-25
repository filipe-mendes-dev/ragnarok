import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RetrievalResults } from "@/features/chat/RetrievalResults";
import type { GenerationRunView } from "@/shared/generation";
import type { RetrievalRunView } from "@/shared/retrieval";

const run: RetrievalRunView = {
    id: "run-id", messageId: "question-id", status: "completed", retryable: true, query: "When can I cancel?",
    scope: { mode: "all" }, limit: 5, model: "test", modelRevision: "test-revision",
    errorMessage: null, timings: { embeddingMs: 1, searchMs: 2, totalMs: 3 },
    chunks: [
        { chunkId: "chunk-1", documentId: "document-1", documentTitle: "Cancellation policy", revision: 1, ordinal: 0, pageNumber: 2, text: "Cancel anytime", rank: 1, semanticSimilarity: 0.9 },
        { chunkId: "chunk-2", documentId: "document-2", documentTitle: "Other policy", revision: 1, ordinal: 0, pageNumber: null, text: "Other details", rank: 2, semanticSimilarity: 0.7 },
    ],
};
const generation: GenerationRunView = {
    traceId: "run-id", attemptId: "attempt-id", status: "completed", retryable: true, promptVersion: "v2",
    selectedChunkIds: ["chunk-1"], provider: "test", requestedModel: "test", responseModel: "test",
    providerResponseId: null, finishReason: "stop", httpStatus: 200, inputTokens: null,
    outputTokens: null, reasoningTokens: null, totalTokens: null, latencyMs: null,
    errorCode: null, errorMessage: null,
};

describe("RetrievalResults", () => {
    it("shows cited evidence first and labels uncited retrieved candidates", () => {
        const html = renderToStaticMarkup(<RetrievalResults
            run={run} generation={generation} answer="Cancel anytime [S1]" messageId="answer-id"
            pending={false} onRetry={() => {}}
        />);
        expect(html).toContain("Cited sources");
        expect(html).toContain('<details id="source-answer-id-1"');
        const sourceSummary = html.split("</summary>")[0];
        expect(sourceSummary).toContain("[1]");
        expect(sourceSummary).toContain("Cancellation policy");
        expect(sourceSummary).toContain("Page 2");
        expect(sourceSummary).not.toContain("Cancel anytime");
        expect(html).toContain("Cancel anytime");
        expect(html).toContain("All retrieved chunks (2)");
        expect(html).toContain("Retrieved only");
    });

    it("keeps the historical citation visible when its document is gone", () => {
        const html = renderToStaticMarkup(<RetrievalResults
            run={{ ...run, chunks: [] }} generation={generation} answer="Cancel anytime [S1]" messageId="answer-id"
            pending={false} onRetry={() => {}}
        />);
        expect(html).toContain("<span>[1]</span><span>Source unavailable</span>");
    });
});
