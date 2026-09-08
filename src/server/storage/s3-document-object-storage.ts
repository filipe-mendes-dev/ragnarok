import {
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
    CreatePdfUploadUrlInput,
    DocumentObjectStorage,
    StoredObjectMetadata,
} from "@/server/modules/documents/document-object-storage-contract";

function isMissingObject(error: unknown): boolean {
    return (
        error instanceof S3ServiceException &&
        (error.name === "NotFound" || error.$metadata.httpStatusCode === 404)
    );
}

export function createS3DocumentObjectStorage(
    client: S3Client,
    bucket: string,
): DocumentObjectStorage {
    async function createPdfUploadUrl(
        input: CreatePdfUploadUrlInput,
    ): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: bucket,
            ContentType: input.contentType,
            IfNoneMatch: "*",
            Key: input.storageKey,
        });

        return getSignedUrl(client, command, {
            expiresIn: input.expiresInSeconds,
            signableHeaders: new Set(["content-type", "if-none-match"]),
        });
    }

    async function getObjectMetadata(
        storageKey: string,
    ): Promise<StoredObjectMetadata | null> {
        try {
            const result = await client.send(
                new HeadObjectCommand({
                    Bucket: bucket,
                    Key: storageKey,
                }),
            );

            return {
                contentType: result.ContentType ?? null,
                sizeBytes: result.ContentLength ?? null,
            };
        } catch (error: unknown) {
            if (isMissingObject(error)) {
                return null;
            }

            throw error;
        }
    }

    return {
        createPdfUploadUrl,
        getObjectMetadata,
    };
}
