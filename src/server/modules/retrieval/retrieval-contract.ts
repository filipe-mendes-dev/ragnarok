export const EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const EMBEDDING_REVISION = "Qdrant/bge-small-en-v1.5-onnx-Q@52398278842ec682c6f32300af41344b1c0b0bb2";
export const EMBEDDING_DIMENSIONS = 384;
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
