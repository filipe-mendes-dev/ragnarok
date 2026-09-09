import Link from "next/link";

import { CreatePdfDocumentForm } from "@/features/documents/CreatePdfDocumentForm";
import { CreateTextDocumentForm } from "@/features/documents/CreateTextDocumentForm";
import type {
    CompletePdfUploadActionResult,
    CreateTextDocumentActionState,
    StartPdfUploadActionResult,
    StartPdfUploadInput,
} from "@/shared/documents";

interface NewDocumentViewProps {
    completePdfUploadAction: (
        documentId: string,
    ) => Promise<CompletePdfUploadActionResult>;
    createTextDocumentAction: (
        state: CreateTextDocumentActionState,
        formData: FormData,
    ) => Promise<CreateTextDocumentActionState>;
    maximumPdfSizeBytes: number;
    startPdfUploadAction: (
        input: StartPdfUploadInput,
    ) => Promise<StartPdfUploadActionResult>;
}

export function NewDocumentView({
    completePdfUploadAction,
    createTextDocumentAction,
    maximumPdfSizeBytes,
    startPdfUploadAction,
}: NewDocumentViewProps) {
    return (
        <main className="px-5 py-10 sm:px-8 sm:py-14">
            <section className="mx-auto max-w-3xl">
                <Link
                    className="inline-flex min-h-11 items-center rounded-control text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    href="/documents"
                >
                    ← Back to documents
                </Link>

                <div className="mt-8 border-b border-border pb-8">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                        New source
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
                        Add a document
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Submit text to PostgreSQL or upload a PDF directly to private
                        object storage. Ingestion will be connected next.
                    </p>
                </div>

                <div className="divide-y divide-border">
                    <section aria-labelledby="add-text-heading" className="py-8">
                        <h2 className="text-xl font-semibold" id="add-text-heading">
                            Paste text
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Store editable source text directly in PostgreSQL.
                        </p>
                        <div className="mt-6">
                            <CreateTextDocumentForm
                                action={createTextDocumentAction}
                            />
                        </div>
                    </section>

                    <section aria-labelledby="add-pdf-heading" className="py-8">
                        <h2 className="text-xl font-semibold" id="add-pdf-heading">
                            Upload PDF
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            PDF bytes bypass the application server and upload through
                            a short-lived storage authorization.
                        </p>
                        <div className="mt-6">
                            <CreatePdfDocumentForm
                                completeAction={completePdfUploadAction}
                                maximumSizeBytes={maximumPdfSizeBytes}
                                startAction={startPdfUploadAction}
                            />
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}
