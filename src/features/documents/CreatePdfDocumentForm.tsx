"use client";

import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";

import {
    DOCUMENT_TITLE_MAX_LENGTH,
    PDF_MIME_TYPE,
    type CompletePdfUploadActionResult,
    type StartPdfUploadActionResult,
    type StartPdfUploadInput,
} from "@/shared/documents";

interface CreatePdfDocumentFormProps {
    completeAction: (
        documentId: string,
    ) => Promise<CompletePdfUploadActionResult>;
    startAction: (
        input: StartPdfUploadInput,
    ) => Promise<StartPdfUploadActionResult>;
    maximumSizeBytes: number;
}

export function CreatePdfDocumentForm({
    completeAction,
    maximumSizeBytes,
    startAction,
}: CreatePdfDocumentFormProps) {
    const router = useRouter();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);

        const formData = new FormData(event.currentTarget);
        const file = formData.get("file");
        const title = formData.get("title");

        if (!(file instanceof File) || typeof title !== "string") {
            setErrorMessage("Select a PDF and provide a title.");
            return;
        }

        if (file.type !== PDF_MIME_TYPE) {
            setErrorMessage("Only PDF documents are supported.");
            return;
        }

        if (file.size > maximumSizeBytes) {
            setErrorMessage("PDF exceeds the configured upload limit.");
            return;
        }

        setIsPending(true);

        try {
            const startResult = await startAction({
                mimeType: file.type,
                originalFilename: file.name,
                sizeBytes: file.size,
                title,
            });

            if (!startResult.upload) {
                setErrorMessage(
                    startResult.errorMessage ?? "Unable to authorize the upload.",
                );
                return;
            }

            const uploadResponse = await fetch(startResult.upload.uploadUrl, {
                body: file,
                headers: startResult.upload.requiredHeaders,
                method: "PUT",
            });

            if (!uploadResponse.ok) {
                setErrorMessage("Object storage rejected the PDF upload.");
                return;
            }

            const completeResult = await completeAction(
                startResult.upload.documentId,
            );

            if (!completeResult.succeeded) {
                setErrorMessage(
                    completeResult.errorMessage ?? "Unable to verify the upload.",
                );
                return;
            }

            router.push("/documents");
            router.refresh();
        } catch {
            setErrorMessage("Unable to complete the PDF upload.");
        } finally {
            setIsPending(false);
        }
    }

    return (
        <form aria-busy={isPending} className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="pdf-title">
                    Title
                </label>
                <input
                    className="h-11 w-full rounded-control border border-border bg-surface px-3 text-base sm:text-sm placeholder:text-muted-foreground transition-colors enabled:hover:border-muted-foreground focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    id="pdf-title"
                    maxLength={DOCUMENT_TITLE_MAX_LENGTH}
                    name="title"
                    placeholder="Architecture reference"
                    required
                    type="text"
                />
            </div>

            <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="pdf-file">
                    PDF file
                </label>
                <input
                    accept={PDF_MIME_TYPE}
                    className="block min-w-0 w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm file:mr-4 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground file:cursor-pointer enabled:hover:file:bg-border disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    id="pdf-file"
                    name="file"
                    required
                    type="file"
                />
                <p className="text-xs text-muted-foreground">
                    Maximum {Math.floor(maximumSizeBytes / (1024 * 1024))} MB. The
                    browser uploads directly to private object storage using a
                    five-minute authorization.
                </p>
            </div>

            <div aria-live="polite" className="min-h-6 text-sm">
                {errorMessage ? (
                    <p className="text-danger" role="alert">
                        {errorMessage}
                    </p>
                ) : null}
            </div>

            <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent py-2.5 px-5 text-sm font-semibold text-accent-foreground transition-colors duration-150 enabled:hover:bg-accent-hover enabled:active:bg-accent-active motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                type="submit"
            >
                {isPending ? "Uploading…" : "Upload PDF"}
            </button>
        </form>
    );
}
