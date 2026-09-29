import type { DocumentRepository } from "@/server/modules/documents/document-repository";
import type { DocumentObjectStorage } from "@/server/modules/documents/document-object-storage-contract";
import { parseDocumentId } from "@/server/modules/documents/document-input";

import { PDF_UPLOAD_URL_LIFETIME_SECONDS } from "@/shared/documents";

export class DocumentDeletionError extends Error {}

export function createDocumentDeletionService(
    repository: DocumentRepository,
    storage: Pick<DocumentObjectStorage, "deleteObject">,
    now: () => Date = () => new Date(),
) {
    async function deleteDocument(userId: string, rawId: string): Promise<void> {
        const id = parseDocumentId(rawId);
        const row = await repository.markDeletingForUser(userId, id);
        if (!row) return;
        // Retain the object while its single-write upload authorization can still be used.
        if (row.storageKey && now().getTime() < row.createdAt.getTime() + PDF_UPLOAD_URL_LIFETIME_SECONDS * 1000) {
            throw new DocumentDeletionError("Removal is pending until the upload link expires. Retry removal in five minutes.");
        }
        if (row.storageKey) {
            try { await storage.deleteObject(row.storageKey); }
            catch { throw new DocumentDeletionError("Storage cleanup failed. Retry removal to finish deleting this document."); }
        }
        await repository.deleteForUser(userId, id);
    }
    return { deleteDocument };
}
