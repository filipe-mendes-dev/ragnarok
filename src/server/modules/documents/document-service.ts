import type { DocumentRow } from "@/server/db/schema/documents";
import type { CreateTextDocumentInput } from "@/server/modules/documents/document-input";
import type { DocumentRepository } from "@/server/modules/documents/document-repository";
import { getRabbitmqUrl } from "@/server/config/env";
import type { IngestionJobInput } from "@/server/modules/ingestion/ingestion-input";
import { publishIngestionJob } from "@/server/queue/rabbitmq-ingestion-publisher";

async function publishJob(job: IngestionJobInput): Promise<void> {
    await publishIngestionJob(getRabbitmqUrl(), job);
}

export function createDocumentService(
    repository: DocumentRepository,
    publish: (job: IngestionJobInput) => Promise<void> = publishJob,
) {
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

        const saved = await repository.insert({
            userId,
            title: source.title,
            sourceType: "text",
            sourceText: source.sourceText,
            storageKey: null,
            originalFilename: null,
            mimeType: "text/plain",
            sizeBytes: Buffer.byteLength(source.sourceText, "utf8"),
        });
        const queued = await repository.markQueuedForUser(userId, saved.id, saved.revision);
        if (!queued) {
            throw new Error("Saved text document could not be queued");
        }
        // Commit queued before publishing: the worker may receive the message immediately.
        await publish({ version: 1, documentId: queued.id, revision: queued.revision, userId });
        return queued;
    }

    return {
        getDocument,
        listDocuments,
        createTextDocument,
    };
}
