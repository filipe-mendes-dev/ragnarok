import { describe, expect, it } from "vitest";
import { buildGenerationContext } from "@/server/modules/generation/generation-context";
import type { RetrievedChunk } from "@/shared/retrieval";

function createChunk(rank: number, text: string): RetrievedChunk {
    return {
        chunkId: `chunk-${rank}`,
        documentId: `document-${rank}`,
        documentTitle: `Document ${rank}`,
        revision: 1,
        ordinal: rank - 1,
        pageNumber: rank,
        text,
        rank,
        semanticSimilarity: 0.8,
    };
}

describe("buildGenerationContext", () => {
    it("orders excerpts by retrieval rank and keeps their source locations", () => {
        const context = buildGenerationContext("When can I cancel?", [createChunk(2, "Later"), createChunk(1, "Earlier")]);
        expect(context.selectedChunkIds).toEqual(["chunk-1", "chunk-2"]);
        expect(context.messages[1]?.content).toContain("Source 1: Document 1 (page 1)\nEarlier");
        const prompt = context.messages[1]?.content ?? "";
        expect(prompt.indexOf("Earlier")).toBeLessThan(prompt.indexOf("Later"));
    });

    it("omits complete excerpts that exceed the context budget", () => {
        const context = buildGenerationContext("Question", [createChunk(1, "A".repeat(11_950)), createChunk(2, "B".repeat(200))]);
        expect(context.selectedChunkIds).toEqual(["chunk-1"]);
        expect(context.messages[1]?.content).not.toContain("B".repeat(200));
    });
});
