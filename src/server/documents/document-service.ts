import type { DocumentRow } from "@/server/db/schema/documents";
import type { DocumentRepository } from "@/server/documents/document-repository";
import type { CreateDocumentInput } from "@/server/documents/document-input";

export function createDocumentService(repository: DocumentRepository) {
    async function getDocument(
        userId: string,
        documentId: string,
    ): Promise<DocumentRow | null> {
        return repository.findByIdForUser(userId, documentId);
    }

    async function listDocuments(userId: string): Promise<DocumentRow[]> {
        return repository.listForUser(userId);
    }

    async function createDocument(
        userId: string,
        source: CreateDocumentInput,
    ): Promise<DocumentRow> {
        if (userId.trim().length === 0) {
            throw new Error("Authenticated user ID is required");
        }

        if (source.sourceType === "text") {
            return repository.insert({
                userId,
                title: source.title,
                sourceType: source.sourceType,
                sourceText: source.sourceText,
                storageKey: null,
                originalFilename: null,
                mimeType: "text/plain",
                sizeBytes: Buffer.byteLength(source.sourceText, "utf8"),
            });
        }

        return repository.insert({
            userId,
            title: source.title,
            sourceType: source.sourceType,
            sourceText: null,
            storageKey: source.storageKey,
            originalFilename: source.originalFilename,
            mimeType: "application/pdf",
            sizeBytes: source.sizeBytes,
        });
    }

    return {
        getDocument,
        listDocuments,
        createDocument,
    };
}
