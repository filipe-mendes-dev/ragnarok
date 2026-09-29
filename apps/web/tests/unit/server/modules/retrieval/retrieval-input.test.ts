import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRetrievalInput } from "@/server/modules/retrieval/retrieval-input";

describe("parseRetrievalInput", () => {
    it("normalizes explicit scope without silently converting an empty selection to all documents", () => {
        const id = randomUUID();
        expect(parseRetrievalInput({ query: " question ", scope: { mode: "selected", documentIds: [id, id] } }))
            .toEqual({ query: "question", scope: { mode: "selected", documentIds: [id] } });
        expect(() => parseRetrievalInput({ query: "question", scope: { mode: "selected", documentIds: [] } })).toThrow();
    });
    it("rejects client-supplied ownership and unexpected filter fields", () => {
        expect(() => parseRetrievalInput({ query: "question", userId: "other" })).toThrow();
        expect(() => parseRetrievalInput({ query: "question", scope: { mode: "all", userId: "other" } })).toThrow();
    });
});
