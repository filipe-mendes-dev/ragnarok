import { randomUUID } from "node:crypto";

import type { DocumentStatus } from "@/shared/documents";

interface DocumentFixture {
    createdAt: Date;
    id: string;
    status: DocumentStatus;
    title: string;
    userId: string;
}

export interface TextDocumentFixture extends DocumentFixture {
    sourceText: string;
    sourceType: "text";
}

export interface PdfDocumentFixture extends DocumentFixture {
    originalFilename: string;
    sizeBytes: number;
    sourceType: "pdf";
    storageKey: string;
}

export function createTextDocumentFixture(
    overrides: Partial<TextDocumentFixture> = {},
): TextDocumentFixture {
    const sourceText = overrides.sourceText ?? "Test document content";
    const createdAt = overrides.createdAt ?? new Date("2026-09-06T10:00:00.000Z");

    return {
        createdAt,
        id: overrides.id ?? randomUUID(),
        sourceText,
        sourceType: "text",
        status: overrides.status ?? "uploaded",
        title: overrides.title ?? "Test document",
        userId: overrides.userId ?? "test-user",
    };
}

export function createPdfDocumentFixture(
    overrides: Partial<PdfDocumentFixture> = {},
): PdfDocumentFixture {
    const id = overrides.id ?? randomUUID();
    const userId = overrides.userId ?? "test-user";
    const createdAt = overrides.createdAt ?? new Date("2026-09-07T10:00:00.000Z");

    return {
        createdAt,
        id,
        originalFilename: overrides.originalFilename ?? "reference.pdf",
        sizeBytes: overrides.sizeBytes ?? 1_024,
        sourceType: "pdf",
        status: overrides.status ?? "uploading",
        storageKey:
            overrides.storageKey ??
            `users/${encodeURIComponent(userId)}/documents/${id}/source.pdf`,
        title: overrides.title ?? "PDF reference",
        userId,
    };
}
