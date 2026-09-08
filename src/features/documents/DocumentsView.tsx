import Link from "next/link";

import type { DocumentSourceType, DocumentStatus } from "@/shared/documents";

interface DocumentListItem {
    createdAt: Date;
    id: string;
    sourceType: DocumentSourceType;
    status: DocumentStatus;
    title: string;
}

interface DocumentsViewProps {
    documents: DocumentListItem[];
    userEmail: string;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
});

export function DocumentsView({ documents, userEmail }: DocumentsViewProps) {
    return (
        <main className="px-5 py-12 sm:px-8 sm:py-16">
            <section className="mx-auto max-w-6xl">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                    Private workspace
                </p>
                <div className="mt-4 flex flex-col justify-between gap-4 border-b border-border pb-8 sm:flex-row sm:items-end">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-[-0.03em]">
                            Documents
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Signed in as {userEmail}
                        </p>
                    </div>
                    <Link
                        className="inline-flex h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                        href="/documents/new"
                    >
                        Add document
                    </Link>
                </div>

                <div className="py-10">
                    <section aria-labelledby="document-list-heading">
                        <div className="flex items-baseline justify-between gap-4">
                            <h2
                                className="text-lg font-semibold"
                                id="document-list-heading"
                            >
                                Your sources
                            </h2>
                            <span className="text-xs text-muted-foreground">
                                {documents.length} total
                            </span>
                        </div>

                        {documents.length === 0 ? (
                            <div className="mt-5 border-t border-border py-12">
                                <h3 className="font-medium">No documents yet</h3>
                                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                                    Add a text source or PDF. It will remain in the
                                    uploaded state until the queue is connected.
                                </p>
                            </div>
                        ) : (
                            <ul className="mt-5 divide-y divide-border border-y border-border">
                                {documents.map((document) => (
                                    <li
                                        className="flex min-w-0 items-start justify-between gap-5 py-4"
                                        key={document.id}
                                    >
                                        <div className="min-w-0">
                                            <h3 className="truncate font-medium">
                                                {document.title}
                                            </h3>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {document.sourceType === "pdf"
                                                    ? "PDF"
                                                    : "Text"}{" "}
                                                · {dateFormatter.format(document.createdAt)}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted-foreground">
                                            {document.status}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </section>
        </main>
    );
}
