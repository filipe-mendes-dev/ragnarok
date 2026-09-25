import { citationLabel, citationNumbers } from "@/shared/citations";
import type { GenerationRunView } from "@/shared/generation";
import type { RetrievedChunk, RetrievalRunView } from "@/shared/retrieval";

interface RetrievalResultsProps {
    run: RetrievalRunView;
    generation: GenerationRunView | undefined;
    answer: string;
    messageId: string;
    pending: boolean;
    onRetry: (run: RetrievalRunView) => void;
}

function location(chunk: RetrievedChunk): string {
    return chunk.pageNumber === null ? "Text document" : `Page ${chunk.pageNumber}`;
}

function SourceRow({ chunk, label, id }: { chunk: RetrievedChunk; label: string; id?: string }) {
    return <li className="min-w-0">
        <details id={id} className="group min-w-0 scroll-mt-6">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                <span className="shrink-0 text-sm font-semibold text-accent">{label}</span>
                <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{chunk.documentTitle}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{location(chunk)}</span>
                <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="border-t border-border px-3 py-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{chunk.text}</p>
            </div>
        </details>
    </li>;
}

export function RetrievalResults({ run, generation, answer, messageId, pending, onRetry }: RetrievalResultsProps) {
    const selected = generation?.selectedChunkIds ?? [];
    const citedNumbers = generation?.status === "completed" ? [...new Set(citationNumbers(answer))].sort((a, b) => a - b) : [];

    return <section className="mt-4 min-w-0" aria-label="Answer sources">
        {run.status !== "completed" && <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{run.status === "started" ? "Retrieval is running. If it was interrupted, retry after one minute." : run.errorMessage}</p>
            <button type="button" disabled={pending || !run.retryable} onClick={() => onRetry(run)} className="min-h-11 rounded-control border border-border px-3 text-sm hover:bg-surface-muted disabled:opacity-50">Retry retrieval</button>
        </div>}

        {citedNumbers.length > 0 && <div className="mb-3">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Cited sources</h2>
            <ol className="min-w-0 divide-y divide-border rounded-panel border border-border bg-surface">
                {citedNumbers.map((number) => {
                    const chunkId = selected[number - 1];
                    const chunk = run.chunks.find((item) => item.chunkId === chunkId);
                    return chunk
                        ? <SourceRow key={number} id={`source-${messageId}-${number}`} chunk={chunk} label={citationLabel(number)} />
                        : <li key={number} className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><span>{citationLabel(number)}</span><span>Source unavailable</span></li>;
                })}
            </ol>
        </div>}

        <details className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-accent">All retrieved chunks ({run.chunks.length})</summary>
            <div className="space-y-3 pb-2">
                {run.status === "completed" && run.chunks.length === 0 && <p>No chunks are available in this retrieval result. Documents may be unavailable or have been removed.</p>}
                <ol className="space-y-2">
                    {run.chunks.map((chunk) => <li key={chunk.chunkId} className="min-w-0 rounded-panel border border-border bg-surface p-3">
                        <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{chunk.rank}. {chunk.documentTitle}</p>
                        <p className="mt-1">{location(chunk)} · {selected.includes(chunk.chunkId) ? "Used as context" : "Retrieved only"}</p>
                        <p className="mt-1">Similarity {chunk.semanticSimilarity.toFixed(3)} · Revision {chunk.revision}</p>
                        <details className="mt-1">
                            <summary className="min-h-11 cursor-pointer py-2 text-accent focus-visible:outline-2 focus-visible:outline-accent">Read excerpt</summary>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{chunk.text}</p>
                        </details>
                    </li>)}
                </ol>
                <details>
                    <summary className="min-h-11 cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-accent">Retrieval details</summary>
                    <dl className="space-y-2">
                        <div><dt>Run</dt><dd>{run.id}</dd></div>
                        <div><dt>Query</dt><dd className="whitespace-pre-wrap">{run.query}</dd></div>
                        <div><dt>Scope</dt><dd>{run.scope.mode === "all" ? "All eligible documents" : `${run.scope.documentIds.length} selected documents`}</dd></div>
                        <div><dt>Method</dt><dd>Exact cosine search · Up to {run.limit} chunks · No minimum similarity threshold</dd></div>
                        <div><dt>Embedding model</dt><dd>{run.modelRevision}</dd></div>
                        {run.timings && <div><dt>Duration</dt><dd>{run.timings.totalMs} ms total{run.status === "completed" ? ` · ${run.timings.embeddingMs} ms embedding · ${run.timings.searchMs} ms search` : ""}</dd></div>}
                    </dl>
                    <p className="mt-2">Similarity measures proximity between embeddings. It is not a confidence percentage or a guarantee of relevance.</p>
                </details>
            </div>
        </details>
    </section>;
}
