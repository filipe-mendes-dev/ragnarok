import { describe, expect, it } from "vitest";

import { ZodError } from "zod";

import { parseCreateDocumentInput } from "@/server/documents/document-input";

describe("parseCreateDocumentInput", () => {
    it("normalizes a valid text document source", () => {
        const source = parseCreateDocumentInput({
            sourceType: "text",
            sourceText: "  Useful source text  ",
            title: "  Notes  ",
        });

        expect(source).toEqual({
            sourceType: "text",
            sourceText: "Useful source text",
            title: "Notes",
        });
    });

    it("rejects a text source without meaningful content", () => {
        expect(() =>
            parseCreateDocumentInput({
                sourceType: "text",
                sourceText: "   ",
                title: "Notes",
            }),
        ).toThrow(ZodError);
    });

    it("rejects a PDF source without an object-storage key", () => {
        expect(() =>
            parseCreateDocumentInput({
                originalFilename: "source.pdf",
                sizeBytes: 1_024,
                sourceType: "pdf",
                storageKey: "",
                title: "Source",
            }),
        ).toThrow(ZodError);
    });
});
