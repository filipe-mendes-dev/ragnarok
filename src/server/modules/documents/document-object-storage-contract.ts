export interface CreatePdfUploadUrlInput {
    contentType: "application/pdf";
    expiresInSeconds: number;
    storageKey: string;
}

export interface StoredObjectMetadata {
    contentType: string | null;
    sizeBytes: number | null;
}

export interface DocumentObjectStorage {
    createPdfUploadUrl(
        input: CreatePdfUploadUrlInput,
    ): Promise<string>;
    getObjectMetadata(
        storageKey: string,
    ): Promise<StoredObjectMetadata | null>;
}
