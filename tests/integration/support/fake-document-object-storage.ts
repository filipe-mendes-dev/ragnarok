import type {
    CreatePdfUploadUrlInput,
    DocumentObjectStorage,
    StoredObjectMetadata,
} from "@/server/modules/documents/document-object-storage-contract";

interface FakeDocumentObjectStorageOptions {
    metadata: StoredObjectMetadata | null;
    uploadUrl: string;
}

export interface FakeDocumentObjectStorage extends DocumentObjectStorage {
    metadataRequests: string[];
    uploadUrlRequests: CreatePdfUploadUrlInput[];
}

export function createFakeDocumentObjectStorage(
    overrides: Partial<FakeDocumentObjectStorageOptions> = {},
): FakeDocumentObjectStorage {
    const metadata =
        "metadata" in overrides
            ? (overrides.metadata ?? null)
            : {
                  contentType: "application/pdf",
                  sizeBytes: 1_024,
              };
    const uploadUrl = overrides.uploadUrl ?? "https://storage.test/upload";
    const metadataRequests: string[] = [];
    const uploadUrlRequests: CreatePdfUploadUrlInput[] = [];

    async function createPdfUploadUrl(
        input: CreatePdfUploadUrlInput,
    ): Promise<string> {
        uploadUrlRequests.push(input);
        return uploadUrl;
    }

    async function getObjectMetadata(
        storageKey: string,
    ): Promise<StoredObjectMetadata | null> {
        metadataRequests.push(storageKey);
        return metadata;
    }

    return {
        createPdfUploadUrl,
        getObjectMetadata,
        metadataRequests,
        uploadUrlRequests,
    };
}
