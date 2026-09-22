import { randomUUID } from "node:crypto";
import type { NewDocumentChunkRow } from "@/server/db/schema/document-chunks";
import { EMBEDDING_MODEL, EMBEDDING_REVISION } from "@/server/modules/retrieval/retrieval-contract";

export function createChunkFixture(documentId: string, chunkConfigId: string, overrides: Partial<NewDocumentChunkRow> = {}): NewDocumentChunkRow {
    return { id: randomUUID(), documentId, chunkConfigId, revision: 1, ordinal: 0,
        text: "Annual subscriptions can be cancelled at any time.", pageNumber: null,
        embedding: [1, ...Array<number>(383).fill(0)], embeddingModel: EMBEDDING_MODEL,
        embeddingRevision: EMBEDDING_REVISION, ...overrides };
}
