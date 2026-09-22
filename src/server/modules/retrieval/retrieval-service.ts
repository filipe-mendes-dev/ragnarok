import type { Database } from "@/server/db/client";
import { embedQuery } from "@/server/embedding/query-embedder";
import type { RetrievalResult, RetrievalDocumentOption } from "@/shared/retrieval";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, RETRIEVAL_LIMIT, RetrievalError } from "./retrieval-contract";
import { parseRetrievalInput } from "./retrieval-input";
import { createRetrievalRepository } from "./retrieval-repository";

export function createRetrievalService(db: Database, embed: typeof embedQuery = embedQuery) {
    async function listDocuments(userId: string): Promise<RetrievalDocumentOption[]> {
        if (!userId.trim()) throw new RetrievalError("unavailable");
        return createRetrievalRepository(db).listEligibleDocuments(userId);
    }

    async function retrieve(userId: string, rawInput: unknown): Promise<RetrievalResult> {
        if (!userId.trim()) throw new RetrievalError("unavailable");
        const input = parseRetrievalInput(rawInput);
        const started = performance.now();
        const embedding = await embed(input.query);
        if (embedding.model !== EMBEDDING_MODEL || embedding.revision !== EMBEDDING_REVISION) throw new RetrievalError("unavailable");
        const embedded = performance.now();
        const chunks = await db.transaction(async (tx) => {
            const repository = createRetrievalRepository(tx);
            if (input.scope.mode === "selected") {
                const eligible = new Set((await repository.listEligibleDocuments(userId)).map((row) => row.id));
                if (input.scope.documentIds.some((id) => !eligible.has(id))) throw new RetrievalError("invalid_scope");
            }
            return repository.searchByVector(userId, embedding, input.scope, RETRIEVAL_LIMIT);
        }, { isolationLevel: "repeatable read", accessMode: "read only" });
        const finished = performance.now();
        return {
            query: input.query, scope: input.scope, limit: RETRIEVAL_LIMIT,
            model: embedding.model, modelRevision: embedding.revision, chunks,
            timings: { embeddingMs: Math.round(embedded - started), searchMs: Math.round(finished - embedded), totalMs: Math.round(finished - started) },
        };
    }
    return { listDocuments, retrieve };
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;
