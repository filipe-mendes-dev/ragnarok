import type { DocumentRow } from "@/server/db/schema/documents";
import type { CreateTextDocumentInput } from "@/server/modules/documents/document-input";
import type { DocumentRepository } from "@/server/modules/documents/document-repository";

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

    async function createTextDocument(
        userId: string,
        source: CreateTextDocumentInput,
    ): Promise<DocumentRow> {
        if (userId.trim().length === 0) {
            throw new Error("Authenticated user ID is required");
        }

        return repository.insert({
            userId,
            title: source.title,
            sourceType: "text",
            sourceText: source.sourceText,
            storageKey: null,
            originalFilename: null,
            mimeType: "text/plain",
            sizeBytes: Buffer.byteLength(source.sourceText, "utf8"),
        });
    }

    return {
        getDocument,
        listDocuments,
        createTextDocument,
    };
}
