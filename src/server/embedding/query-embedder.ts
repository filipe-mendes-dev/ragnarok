import { z } from "zod";
import {
    EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_REVISION, RetrievalError,
    type QueryEmbedding,
} from "@/server/modules/retrieval/retrieval-contract";

const responseSchema = z.object({
    model: z.literal(EMBEDDING_MODEL),
    revision: z.literal(EMBEDDING_REVISION),
    vectors: z.array(z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS)
        .refine((vector) => vector.some((value) => value !== 0))).length(1),
}).strict();

export async function embedQuery(query: string): Promise<QueryEmbedding> {
    try {
        const endpoint = process.env.EMBEDDING_SERVICE_URL;
        if (!endpoint) throw new RetrievalError("unavailable");
        const response = await fetch(`${endpoint.replace(/\/$/, "")}/embed`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "query", texts: [query] }),
            signal: AbortSignal.timeout(20_000), cache: "no-store", redirect: "error",
        });
        if (response.status === 422) throw new RetrievalError("invalid_query");
        if (!response.ok) throw new RetrievalError("unavailable");
        const parsed = responseSchema.parse(await response.json());
        const vector = parsed.vectors[0];
        if (!vector) throw new RetrievalError("unavailable");
        return { vector, model: parsed.model, revision: parsed.revision };
    } catch (error: unknown) {
        if (error instanceof RetrievalError) throw error;
        throw new RetrievalError("unavailable");
    }
}
