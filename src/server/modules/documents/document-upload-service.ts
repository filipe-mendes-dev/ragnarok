import { randomUUID } from "node:crypto";

import type { DocumentRow } from "@/server/db/schema/documents";
import type { DocumentObjectStorage } from "@/server/modules/documents/document-object-storage-contract";
import type { DocumentRepository } from "@/server/modules/documents/document-repository";
import {
    PDF_MIME_TYPE,
    type PdfUploadAuthorization,
    type StartPdfUploadInput,
} from "@/shared/documents";

const UPLOAD_URL_LIFETIME_SECONDS = 5 * 60;

const DOCUMENT_UPLOAD_ERROR_MESSAGES = {
    invalid_state: "PDF upload is not awaiting completion",
    metadata_mismatch: "Uploaded PDF does not match the authorized file metadata",
    object_not_found: "Uploaded PDF was not found in object storage",
    upload_not_found: "PDF upload was not found",
} as const;

export type DocumentUploadErrorCode =
    keyof typeof DOCUMENT_UPLOAD_ERROR_MESSAGES;

export class DocumentUploadError extends Error {
    readonly code: DocumentUploadErrorCode;

    constructor(code: DocumentUploadErrorCode) {
        super(DOCUMENT_UPLOAD_ERROR_MESSAGES[code]);
        this.name = "DocumentUploadError";
        this.code = code;
    }
}

function createPdfStorageKey(userId: string, documentId: string): string {
    return `users/${encodeURIComponent(userId)}/documents/${documentId}/source.pdf`;
}

export function createDocumentUploadService(
    repository: DocumentRepository,
    objectStorage: DocumentObjectStorage,
) {
    async function startPdfUpload(
        userId: string,
        input: StartPdfUploadInput,
    ): Promise<PdfUploadAuthorization> {
        if (userId.trim().length === 0) {
            throw new Error("Authenticated user ID is required");
        }

        const documentId = randomUUID();
        const storageKey = createPdfStorageKey(userId, documentId);
        const uploadUrl = await objectStorage.createPdfUploadUrl({
            contentType: PDF_MIME_TYPE,
            expiresInSeconds: UPLOAD_URL_LIFETIME_SECONDS,
            storageKey,
        });

        await repository.insert({
            id: documentId,
            mimeType: PDF_MIME_TYPE,
            originalFilename: input.originalFilename,
            sizeBytes: input.sizeBytes,
            sourceText: null,
            sourceType: "pdf",
            status: "uploading",
            storageKey,
            title: input.title,
            userId,
        });

        return {
            documentId,
            requiredHeaders: {
                "Content-Type": PDF_MIME_TYPE,
                "If-None-Match": "*",
            },
            uploadUrl,
        };
    }

    async function completePdfUpload(
        userId: string,
        documentId: string,
    ): Promise<DocumentRow> {
        const document = await repository.findByIdForUser(userId, documentId);

        if (!document || document.sourceType !== "pdf" || !document.storageKey) {
            throw new DocumentUploadError("upload_not_found");
        }

        if (document.status === "uploaded") {
            return document;
        }

        if (document.status !== "uploading") {
            throw new DocumentUploadError("invalid_state");
        }

        const metadata = await objectStorage.getObjectMetadata(
            document.storageKey,
        );

        if (!metadata) {
            throw new DocumentUploadError("object_not_found");
        }

        if (
            metadata.contentType !== PDF_MIME_TYPE ||
            metadata.sizeBytes !== document.sizeBytes
        ) {
            throw new DocumentUploadError("metadata_mismatch");
        }

        const uploadedDocument = await repository.markUploadedForUser(
            userId,
            documentId,
        );

        if (uploadedDocument) {
            return uploadedDocument;
        }

        const currentDocument = await repository.findByIdForUser(
            userId,
            documentId,
        );

        if (currentDocument?.status === "uploaded") {
            return currentDocument;
        }

        throw new DocumentUploadError("invalid_state");
    }

    return {
        startPdfUpload,
        completePdfUpload,
    };
}
