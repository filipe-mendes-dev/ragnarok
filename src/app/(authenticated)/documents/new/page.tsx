import Link from "next/link";

import { CreateTextDocumentForm } from "@/features/documents/CreateTextDocumentForm";

import { createTextDocumentAction } from "../actions";

export default function NewDocumentPage() {
    return (
        <main className="px-5 py-12 sm:px-8 sm:py-16">
            <section className="mx-auto max-w-3xl">
                <Link
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    href="/documents"
                >
                    ← Back to documents
                </Link>

                <div className="mt-8 border-b border-border pb-8">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                        New source
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
                        Add a text document
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Store plain text privately in PostgreSQL. It will remain
                        uploaded until asynchronous ingestion is connected.
                    </p>
                </div>

                <div className="py-8">
                    <CreateTextDocumentForm action={createTextDocumentAction} />
                </div>
            </section>
        </main>
    );
}
