'use server';

import { redirect } from 'next/navigation';
import { ZodError } from 'zod';

import { requireCurrentUser } from '@/server/auth/session';
import { getServerEnvironment } from '@/server/config/env';
import { database } from '@/server/db/client';
import {
    parseCreateTextDocumentInput,
    parseDocumentId,
    parseStartPdfUploadInput,
    type CreateTextDocumentInput,
} from '@/server/modules/documents/document-input';
import { createDocumentRepository } from '@/server/modules/documents/document-repository';
import {
    DocumentUploadError,
    createDocumentUploadService,
} from '@/server/modules/documents/document-upload-service';
import { createDocumentService } from '@/server/modules/documents/document-service';
import { createS3DocumentObjectStorage } from '@/server/storage/s3-document-object-storage';
import { s3Bucket, s3Client } from '@/server/storage/s3-client';
import type {
    CompletePdfUploadActionResult,
    CreateTextDocumentActionState,
    StartPdfUploadActionResult,
    StartPdfUploadInput,
} from '@/shared/documents';

function getFirstZodError(error: ZodError): string {
    return error.issues[0]?.message ?? 'Invalid document details';
}

const documentRepository = createDocumentRepository(database);
const documentService = createDocumentService(documentRepository);
const documentObjectStorage = createS3DocumentObjectStorage(s3Client, s3Bucket);
const documentUploadService = createDocumentUploadService(
    documentRepository,
    documentObjectStorage,
);

export async function createTextDocumentAction(
    _previousState: CreateTextDocumentActionState,
    formData: FormData,
): Promise<CreateTextDocumentActionState> {
    const user = await requireCurrentUser();

    let input: CreateTextDocumentInput;

    try {
        input = parseCreateTextDocumentInput({
            sourceText: formData.get('sourceText'),
            title: formData.get('title'),
        });
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            return {
                errorMessage: getFirstZodError(error),
            };
        }

        throw error;
    }

    await documentService.createTextDocument(user.id, input);

    redirect('/documents');
}

export async function startPdfUploadAction(
    input: StartPdfUploadInput,
): Promise<StartPdfUploadActionResult> {
    const user = await requireCurrentUser();

    try {
        const parsedInput = parseStartPdfUploadInput(
            input,
            getServerEnvironment().PDF_MAX_UPLOAD_SIZE_BYTES,
        );
        const upload = await documentUploadService.startPdfUpload(
            user.id,
            parsedInput,
        );

        return {
            errorMessage: null,
            upload,
        };
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            return {
                errorMessage: getFirstZodError(error),
                upload: null,
            };
        }

        throw error;
    }
}

export async function completePdfUploadAction(
    documentId: string,
): Promise<CompletePdfUploadActionResult> {
    const user = await requireCurrentUser();

    try {
        const parsedDocumentId = parseDocumentId(documentId);
        await documentUploadService.completePdfUpload(
            user.id,
            parsedDocumentId,
        );

        return {
            errorMessage: null,
            succeeded: true,
        };
    } catch (error: unknown) {
        if (
            error instanceof ZodError ||
            error instanceof DocumentUploadError
        ) {
            return {
                errorMessage:
                    error instanceof ZodError
                        ? getFirstZodError(error)
                        : error.message,
                succeeded: false,
            };
        }

        throw error;
    }
}
