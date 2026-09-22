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
    deleteObject(storageKey: string): Promise<void>;
    createPdfUploadUrl(
        input: CreatePdfUploadUrlInput,
    ): Promise<string>;
    getObjectMetadata(
        storageKey: string,
    ): Promise<StoredObjectMetadata | null>;
}
