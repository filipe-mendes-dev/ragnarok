'use server';

import { redirect } from 'next/navigation';
import { ZodError } from 'zod';

import { requireCurrentUser } from '@/server/auth/session';
import { database } from '@/server/db/client';
import {
    parseCreateTextDocumentInput,
    type CreateTextDocumentInput,
} from '@/server/modules/documents/document-input';
import { createDocumentRepository } from '@/server/modules/documents/document-repository';
import { createDocumentService } from '@/server/modules/documents/document-service';
import type { CreateTextDocumentActionState } from '@/shared/documents';

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
                errorMessage:
                    error.issues[0]?.message ?? 'Invalid document details',
            };
        }

        throw error;
    }

    const repository = createDocumentRepository(database);
    const service = createDocumentService(repository);
    await service.createTextDocument(user.id, input);

    redirect('/documents');
}
