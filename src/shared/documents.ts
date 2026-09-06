export const DOCUMENT_SOURCE_TYPES = ["text", "pdf"] as const;
export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const TEXT_DOCUMENT_MAX_CHARACTERS = 100_000;

export interface CreateTextDocumentActionState {
    errorMessage: string | null;
}
