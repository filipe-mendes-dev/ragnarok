import { describe, expect, it } from "vitest";

import { ZodError } from "zod";

import { parseCreateTextDocumentInput } from "@/server/modules/documents/document-input";

describe("parseCreateTextDocumentInput", () => {
    it("normalizes a valid text document source", () => {
        const source = parseCreateTextDocumentInput({
            sourceText: "  Useful source text  ",
            title: "  Notes  ",
        });

        expect(source).toEqual({
            sourceText: "Useful source text",
            title: "Notes",
        });
    });

    it("rejects a text source without meaningful content", () => {
        expect(() =>
            parseCreateTextDocumentInput({
                sourceText: "   ",
                title: "Notes",
            }),
        ).toThrow(ZodError);
    });

    it("rejects document text above the accepted limit", () => {
        expect(() =>
            parseCreateTextDocumentInput({
                sourceText: "a".repeat(100_001),
                title: "Notes",
            }),
        ).toThrow(ZodError);
    });
});
