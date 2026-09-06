import { randomUUID } from "node:crypto";

export interface TextDocumentFixture {
    createdAt: Date;
    id: string;
    mimeType: "text/plain";
    originalFilename: null;
    processingError: string | null;
    revision: number;
    sizeBytes: number;
    sourceText: string;
    sourceType: "text";
    status: "uploaded" | "queued" | "processing" | "completed" | "failed";
    storageKey: null;
    title: string;
    updatedAt: Date;
    userId: string;
}

export function createTextDocumentFixture(
    overrides: Partial<TextDocumentFixture> = {},
): TextDocumentFixture {
    const sourceText = overrides.sourceText ?? "Test document content";
    const createdAt = overrides.createdAt ?? new Date("2026-09-06T10:00:00.000Z");

    return {
        createdAt,
        id: overrides.id ?? randomUUID(),
        mimeType: "text/plain",
        originalFilename: null,
        processingError: overrides.processingError ?? null,
        revision: overrides.revision ?? 1,
        sizeBytes:
            overrides.sizeBytes ?? Buffer.byteLength(sourceText, "utf8"),
        sourceText,
        sourceType: "text",
        status: overrides.status ?? "uploaded",
        storageKey: null,
        title: overrides.title ?? "Test document",
        updatedAt: overrides.updatedAt ?? createdAt,
        userId: overrides.userId ?? "test-user",
    };
}
