import type { Database } from "@/server/db/client";
import {
    document,
    type NewDocumentRow,
} from "@/server/db/schema/documents";
import { PDF_MIME_TYPE } from "@/shared/documents";

import type {
    PdfDocumentFixture,
    TextDocumentFixture,
} from "../../../fixtures/documents";

export async function seedDocument(
    database: Database,
    fixture: PdfDocumentFixture | TextDocumentFixture,
): Promise<void> {
    const commonFields = {
        createdAt: fixture.createdAt,
        id: fixture.id,
        status: fixture.status,
        title: fixture.title,
        userId: fixture.userId,
    };

    const row = (
        fixture.sourceType === "text"
            ? {
                  ...commonFields,
                  mimeType: "text/plain",
                  originalFilename: null,
                  sizeBytes: Buffer.byteLength(fixture.sourceText, "utf8"),
                  sourceText: fixture.sourceText,
                  sourceType: fixture.sourceType,
                  storageKey: null,
              }
            : {
                  ...commonFields,
                  mimeType: PDF_MIME_TYPE,
                  originalFilename: fixture.originalFilename,
                  sizeBytes: fixture.sizeBytes,
                  sourceText: null,
                  sourceType: fixture.sourceType,
                  storageKey: fixture.storageKey,
              }
    ) satisfies NewDocumentRow;

    await database.insert(document).values(row);
}
