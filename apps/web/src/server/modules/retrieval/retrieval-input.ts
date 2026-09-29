import { z } from "zod";
import type { DocumentScope } from "@/shared/retrieval";

const scopeSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("all") }).strict(),
    z.object({ mode: z.literal("selected"), documentIds: z.array(z.uuid()).min(1, "Select at least one document").max(100) }).strict(),
]);
const retrievalInputSchema = z.object({
    query: z.string().trim().min(1, "Write a question first").max(10000, "Keep messages under 10,000 characters"),
    scope: scopeSchema.default({ mode: "all" }),
}).strict();

export interface RetrievalInput {
    query: string;
    scope: DocumentScope;
}

export function parseDocumentScope(input: unknown): DocumentScope {
    const scope = scopeSchema.parse(input);
    return scope.mode === "all" ? scope : { mode: "selected", documentIds: [...new Set(scope.documentIds)].sort() };
}

export function parseRetrievalInput(input: unknown): RetrievalInput {
    const parsed = retrievalInputSchema.parse(input);
    return { query: parsed.query, scope: parseDocumentScope(parsed.scope) };
}
