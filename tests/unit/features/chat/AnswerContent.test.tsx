import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerContent } from "@/features/chat/AnswerContent";
import type { GenerationRunView } from "@/shared/generation";
import type { RetrievedChunk } from "@/shared/retrieval";

const generation: GenerationRunView = {
    traceId: "run-id", attemptId: "attempt-id", status: "completed", retryable: true, promptVersion: "v2",
    selectedChunkIds: ["chunk-1"], provider: "test", requestedModel: "test", responseModel: "test",
    providerResponseId: null, finishReason: "stop", httpStatus: 200, inputTokens: null,
    outputTokens: null, reasoningTokens: null, totalTokens: null, latencyMs: null,
    errorCode: null, errorMessage: null,
};
const chunk: RetrievedChunk = {
    chunkId: "chunk-1", documentId: "document-1", documentTitle: "Cancellation policy",
    revision: 1, ordinal: 0, pageNumber: 2, text: "Cancel anytime", rank: 1, semanticSimilarity: 0.9,
};

describe("AnswerContent", () => {
    it("formats Markdown and links only validated citations to available evidence", () => {
        const html = renderToStaticMarkup(<AnswerContent
            content={"**Cancel anytime** [S1]\n\n- No fee\n\n[External](https://example.com) <script>unsafe</script> ![image](https://example.com/image.png)"}
            generation={generation} chunks={[chunk]} messageId="message-1"
        />);

        expect(html).toContain("<strong>Cancel anytime</strong>");
        expect(html).toContain("<li>No fee</li>");
        expect(html).toContain('href="#source-message-1-1"');
        expect(html).not.toContain('href="https://example.com"');
        expect(html).not.toContain("<script");
        expect(html).not.toContain("<img");
    });

    it("shows an unavailable label after its evidence snapshot is removed", () => {
        const html = renderToStaticMarkup(<AnswerContent content="Cancel anytime [S1]" generation={generation} chunks={[]} messageId="message-1" />);
        expect(html).toContain("source unavailable");
        expect(html).not.toContain("href=");
    });

    it("keeps unfinished output as text until the answer is saved", () => {
        const html = renderToStaticMarkup(<AnswerContent content="**Partial" generation={undefined} chunks={[]} messageId="message-1" />);
        expect(html).toContain("**Partial");
        expect(html).not.toContain("<strong>");
    });
});
