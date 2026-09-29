export type DocumentScope = { mode: "all" } | { mode: "selected"; documentIds: string[] };

export interface RetrievedChunk {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    revision: number;
    ordinal: number;
    pageNumber: number | null;
    text: string;
    rank: number;
    semanticSimilarity: number;
}

export interface RetrievalTimings {
    embeddingMs: number | null;
    searchMs: number | null;
    totalMs: number;
}

export interface RetrievalResult {
    query: string;
    scope: DocumentScope;
    limit: number;
    model: string;
    modelRevision: string;
    timings: RetrievalTimings;
    chunks: RetrievedChunk[];
}

export interface RetrievalRunView {
    id: string;
    messageId: string;
    status: "started" | "completed" | "failed";
    retryable: boolean;
    query: string;
    scope: DocumentScope;
    limit: number;
    model: string;
    modelRevision: string;
    errorMessage: string | null;
    timings: RetrievalTimings | null;
    chunks: RetrievedChunk[];
}

export interface RetrievalDocumentOption {
    id: string;
    title: string;
}
