import type { Database } from "@/server/db/client";
import { document } from "@/server/db/document-schema";

import type { TextDocumentFixture } from "../../fixtures/documents";

export async function seedTextDocument(
    database: Database,
    fixture: TextDocumentFixture,
): Promise<void> {
    await database.insert(document).values({
        createdAt: fixture.createdAt,
        id: fixture.id,
        mimeType: fixture.mimeType,
        originalFilename: fixture.originalFilename,
        processingError: fixture.processingError,
        revision: fixture.revision,
        sizeBytes: fixture.sizeBytes,
        sourceText: fixture.sourceText,
        sourceType: fixture.sourceType,
        status: fixture.status,
        storageKey: fixture.storageKey,
        title: fixture.title,
        updatedAt: fixture.updatedAt,
        userId: fixture.userId,
    });
}
