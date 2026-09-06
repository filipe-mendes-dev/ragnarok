import { z } from "zod";

import {
    DOCUMENT_TITLE_MAX_LENGTH,
    TEXT_DOCUMENT_MAX_CHARACTERS,
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
