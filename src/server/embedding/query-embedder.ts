import { z } from "zod";
import { getEmbeddingEnvironment } from "@/server/config/env";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_RESPONSE_MODEL, EMBEDDING_REVISION, EMBEDDING_TIMEOUT_MS } from "@/server/embedding/embedding-config";
import {
    RetrievalError, type QueryEmbedding,
} from "@/server/modules/retrieval/retrieval-contract";

const responseSchema = z.object({
    model: z.union([z.literal(EMBEDDING_MODEL), z.literal(EMBEDDING_RESPONSE_MODEL)]),
    data: z.array(z.object({
        index: z.literal(0),
        embedding: z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS)
            .refine((vector) => vector.some((value) => value !== 0)),
    })).length(1),
});

export async function embedQuery(query: string): Promise<QueryEmbedding> {
    try {
        const environment = getEmbeddingEnvironment();
        if (!environment) throw new RetrievalError("unavailable");
        const response = await fetch(environment.OPENROUTER_EMBEDDINGS_URL, {
            method: "POST", headers: {
                Authorization: `Bearer ${environment.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input: query, encoding_format: "float" }),
            signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS), cache: "no-store", redirect: "error",
        });
        if ([400, 413, 422].includes(response.status)) throw new RetrievalError("invalid_query");
        if (!response.ok) throw new RetrievalError("unavailable");
        const parsed = responseSchema.parse(await response.json());
        const vector = parsed.data[0]?.embedding;
        if (!vector) throw new RetrievalError("unavailable");
        return { vector, model: EMBEDDING_MODEL, revision: EMBEDDING_REVISION };
    } catch (error: unknown) {
        if (error instanceof RetrievalError) throw error;
        throw new RetrievalError("unavailable");
    }
}
