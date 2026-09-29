export { EMBEDDING_MODEL, EMBEDDING_REVISION, EMBEDDING_DIMENSIONS } from "@/server/embedding/embedding-config";
export const RETRIEVAL_LIMIT = 5;

export interface QueryEmbedding {
    vector: number[];
    model: string;
    revision: string;
}

export class RetrievalError extends Error {
    constructor(public readonly code: "invalid_query" | "unavailable" | "invalid_scope") {
        super(code === "invalid_query"
            ? "Your question is too long for retrieval. Shorten it and try again."
            : code === "invalid_scope"
                ? "One or more selected documents are unavailable for retrieval. Update your selection."
                : "Retrieval is unavailable. Please retry.");
        this.name = "RetrievalError";
    }
}
