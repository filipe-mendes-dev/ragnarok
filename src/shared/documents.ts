export const DOCUMENT_SOURCE_TYPES = ["text", "pdf"] as const;
export const DOCUMENT_STATUSES = [
    "uploading",
    "uploaded",
    "queued",
    "processing",
    "completed",
    "failed",
] as const;
export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const TEXT_DOCUMENT_MAX_CHARACTERS = 100_000;
export const PDF_MIME_TYPE = "application/pdf";
export const DEFAULT_PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface CreateTextDocumentActionState {
    errorMessage: string | null;
}

export interface StartPdfUploadInput {
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
    title: string;
}

export interface PdfUploadAuthorization {
    documentId: string;
    requiredHeaders: Record<string, string>;
    uploadUrl: string;
}

export interface StartPdfUploadActionResult {
    errorMessage: string | null;
    upload: PdfUploadAuthorization | null;
}

export interface CompletePdfUploadActionResult {
    errorMessage: string | null;
    succeeded: boolean;
}
