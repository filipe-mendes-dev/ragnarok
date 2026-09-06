import Link from "next/link";

const pipelineStages = ["Ingest", "Retrieve", "Explain"] as const;

export function LandingPage() {
    return (
        <main className="px-5 py-16 sm:px-8 sm:py-24">
            <section className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
                <div className="max-w-2xl">
                    <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                        Private document intelligence
                    </p>
                    <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                        Ask your documents. Inspect every step.
                    </h1>
                    <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                        Upload source material, receive grounded answers with citations,
                        and inspect how retrieval and generation produced each result.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Link
                            className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            href="/sign-up"
                        >
                            Create account
                        </Link>
                        <Link
                            className="inline-flex h-11 items-center justify-center rounded-control border border-border bg-surface px-5 text-sm font-semibold transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            href="/sign-in"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>

                <div className="rounded-panel border border-border bg-surface-muted p-5 sm:p-6">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                        <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Retrieval trace
                        </span>
                        <span
                            aria-hidden="true"
                            className="size-2 rounded-full bg-accent"
                        />
                    </div>

                    <ol className="mt-2">
                        {pipelineStages.map((stage, index) => (
                            <li
                                className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-border py-4 last:border-b-0"
                                key={stage}
                            >
                                <span className="font-mono text-xs text-muted-foreground">
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="text-sm font-medium">{stage}</span>
                                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-accent">
                                    Ready
                                </span>
                            </li>
                        ))}
                    </ol>

                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        Every answer keeps its query, selected chunks, citations, model
                        usage, and stage latency available for inspection.
                    </p>
                </div>
            </section>
        </main>
    );
}
