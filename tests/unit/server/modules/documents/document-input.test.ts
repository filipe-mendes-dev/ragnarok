import { describe, expect, it } from "vitest";

import { ZodError } from "zod";

import {
    parseCreateTextDocumentInput,
    parseDocumentId,
    parseStartPdfUploadInput,
} from "@/server/modules/documents/document-input";
import { DEFAULT_PDF_MAX_SIZE_BYTES } from "@/shared/documents";

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

describe("parseDocumentId", () => {
    it("rejects malformed document identifiers", () => {
        expect(() => parseDocumentId("not-a-uuid")).toThrow(ZodError);
    });
});

describe("parseStartPdfUploadInput", () => {
    it("normalizes valid PDF upload metadata", () => {
        const input = parseStartPdfUploadInput(
            {
                mimeType: "application/pdf",
                originalFilename: "  reference.pdf  ",
                sizeBytes: 1_024,
                title: "  Reference  ",
            },
            DEFAULT_PDF_MAX_SIZE_BYTES,
        );

        expect(input).toEqual({
            mimeType: "application/pdf",
            originalFilename: "reference.pdf",
            sizeBytes: 1_024,
            title: "Reference",
        });
    });

    it("rejects non-PDF content types", () => {
        expect(() =>
            parseStartPdfUploadInput(
                {
                    mimeType: "text/plain",
                    originalFilename: "reference.pdf",
                    sizeBytes: 1_024,
                    title: "Reference",
                },
                DEFAULT_PDF_MAX_SIZE_BYTES,
            ),
        ).toThrow(ZodError);
    });

    it("rejects PDFs larger than 10 MB", () => {
        expect(() =>
            parseStartPdfUploadInput(
                {
                    mimeType: "application/pdf",
                    originalFilename: "reference.pdf",
                    sizeBytes: DEFAULT_PDF_MAX_SIZE_BYTES + 1,
                    title: "Reference",
                },
                DEFAULT_PDF_MAX_SIZE_BYTES,
            ),
        ).toThrow(ZodError);
    });
});
