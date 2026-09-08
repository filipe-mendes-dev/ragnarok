"use client";

import { useActionState } from "react";

import {
    DOCUMENT_TITLE_MAX_LENGTH,
    TEXT_DOCUMENT_MAX_CHARACTERS,
    type CreateTextDocumentActionState,
} from "@/shared/documents";

interface CreateTextDocumentFormProps {
    action: (
        state: CreateTextDocumentActionState,
        formData: FormData,
    ) => Promise<CreateTextDocumentActionState>;
}

const INITIAL_STATE: CreateTextDocumentActionState = {
    errorMessage: null,
};

export function CreateTextDocumentForm({ action }: CreateTextDocumentFormProps) {
    const [state, formAction, isPending] = useActionState(
        action,
        INITIAL_STATE,
    );

    return (
        <form
            action={formAction}
            aria-busy={isPending}
            className="space-y-5"
        >
            <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="document-title">
                    Title
                </label>
                <input
                    className="h-11 w-full rounded-control border border-border bg-surface px-3 text-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/20"
                    disabled={isPending}
                    id="document-title"
                    maxLength={DOCUMENT_TITLE_MAX_LENGTH}
                    name="title"
                    placeholder="Quarterly report notes"
                    required
                    type="text"
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="document-text">
                    Document text
                </label>
                <textarea
                    className="min-h-52 w-full resize-y rounded-control border border-border bg-surface px-3 py-3 text-sm leading-6 outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/20"
                    disabled={isPending}
                    id="document-text"
                    maxLength={TEXT_DOCUMENT_MAX_CHARACTERS}
                    name="sourceText"
                    placeholder="Paste the source material you want to query later."
                    required
                />
                <p className="text-xs text-muted-foreground">
                    Up to 100,000 characters. Chunking and embeddings will be added
                    after the source workflows are complete.
                </p>
            </div>

            <div aria-live="polite" className="min-h-6 text-sm">
                {state.errorMessage ? (
                    <p className="text-danger" role="alert">
                        {state.errorMessage}
                    </p>
                ) : null}
            </div>

            <button
                className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                type="submit"
            >
                {isPending ? "Saving…" : "Save text document"}
            </button>
        </form>
    );
}
