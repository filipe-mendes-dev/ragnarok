import { z } from "zod";

import {
    DOCUMENT_TITLE_MAX_LENGTH,
    PDF_MIME_TYPE,
    TEXT_DOCUMENT_MAX_CHARACTERS,
    type StartPdfUploadInput,
} from "@/shared/documents";

const createTextDocumentSchema = z.object({
    sourceText: z
        .string()
        .trim()
        .min(1, "Document text is required")
        .max(
            TEXT_DOCUMENT_MAX_CHARACTERS,
            "Document text must contain at most 100,000 characters",
        ),
    title: z
        .string()
        .trim()
        .min(1, "Title is required")
        .max(
            DOCUMENT_TITLE_MAX_LENGTH,
            "Title must contain at most 200 characters",
        ),
});

export type CreateTextDocumentInput = z.infer<typeof createTextDocumentSchema>;

export function parseCreateTextDocumentInput(
    input: unknown,
): CreateTextDocumentInput {
    return createTextDocumentSchema.parse(input);
}

function createStartPdfUploadSchema(
    maximumSizeBytes: number,
): z.ZodType<StartPdfUploadInput> {
    return z.object({
        mimeType: z.literal(PDF_MIME_TYPE, {
            error: "Only PDF documents are supported",
        }),
        originalFilename: z
            .string()
            .trim()
            .min(1, "A PDF filename is required")
            .max(255, "PDF filename must contain at most 255 characters"),
        sizeBytes: z
            .number()
            .int()
            .positive("PDF must not be empty")
            .max(maximumSizeBytes, "PDF exceeds the configured upload limit"),
        title: z
            .string()
            .trim()
            .min(1, "Title is required")
            .max(
                DOCUMENT_TITLE_MAX_LENGTH,
                "Title must contain at most 200 characters",
            ),
    });
}

export function parseStartPdfUploadInput(
    input: unknown,
    maximumSizeBytes: number,
): StartPdfUploadInput {
    return createStartPdfUploadSchema(maximumSizeBytes).parse(input);
}

const documentIdSchema = z.uuid({ error: "Invalid document identifier" });

export function parseDocumentId(input: unknown): string {
    return documentIdSchema.parse(input);
}
