import { and, asc, cosineDistance, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { documentChunk } from "@/server/db/schema/document-chunks";
import { document } from "@/server/db/schema/documents";
import type { DocumentScope, RetrievedChunk, RetrievalDocumentOption } from "@/shared/retrieval";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, type QueryEmbedding } from "./retrieval-contract";

type RetrievalDatabase = Pick<Database, "select" | "selectDistinct">;

export function createRetrievalRepository(db: RetrievalDatabase) {
    async function listEligibleDocuments(userId: string): Promise<RetrievalDocumentOption[]> {
        return db.selectDistinct({ id: document.id, title: document.title }).from(document)
            .innerJoin(documentChunk, and(eq(documentChunk.documentId, document.id), eq(documentChunk.revision, document.revision)))
            .where(and(eq(document.userId, userId), eq(document.status, "completed"),
                isNotNull(documentChunk.embedding), eq(documentChunk.embeddingModel, EMBEDDING_MODEL),
                eq(documentChunk.embeddingRevision, EMBEDDING_REVISION)))
            .orderBy(asc(document.title), asc(document.id));
    }

    async function searchByVector(userId: string, embedding: QueryEmbedding, scope: DocumentScope, limit: number): Promise<RetrievedChunk[]> {
        const distance = cosineDistance(documentChunk.embedding, embedding.vector);
        const rows = await db.select({
            chunkId: documentChunk.id, documentId: document.id, documentTitle: document.title,
            revision: documentChunk.revision, ordinal: documentChunk.ordinal, pageNumber: documentChunk.pageNumber,
            text: documentChunk.text, semanticSimilarity: sql<number>`1 - (${distance})`.mapWith(Number),
        }).from(documentChunk).innerJoin(document, eq(documentChunk.documentId, document.id))
            .where(and(eq(document.userId, userId), eq(document.status, "completed"),
                eq(documentChunk.revision, document.revision), isNotNull(documentChunk.embedding),
                eq(documentChunk.embeddingModel, embedding.model), eq(documentChunk.embeddingRevision, embedding.revision),
                scope.mode === "selected" ? inArray(document.id, scope.documentIds) : undefined))
            .orderBy(asc(distance), asc(documentChunk.id)).limit(limit);
        return rows.map((row, index) => ({ ...row, rank: index + 1 }));
    }
    return { listEligibleDocuments, searchByVector };
}
