import { z } from "zod";

export const DOCUMENT_SOURCE_TYPES = ["text", "pdf"] as const;

const requiredTrimmedString = z.string().trim().min(1);

const createTextDocumentSchema = z.object({
    sourceType: z.literal("text"),
    sourceText: requiredTrimmedString,
    title: requiredTrimmedString,
});

const createPdfDocumentSchema = z.object({
    originalFilename: requiredTrimmedString,
    sizeBytes: z.number().int().positive(),
    sourceType: z.literal("pdf"),
    storageKey: requiredTrimmedString,
    title: requiredTrimmedString,
});

const createDocumentSchema = z.discriminatedUnion("sourceType", [
    createTextDocumentSchema,
    createPdfDocumentSchema,
]);

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export function parseCreateDocumentInput(input: unknown): CreateDocumentInput {
    return createDocumentSchema.parse(input);
}
