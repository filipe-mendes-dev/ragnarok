import type { RetrievalRunView } from "@/shared/retrieval";

interface RetrievalResultsProps {
    run: RetrievalRunView;
    pending: boolean;
    onRetry: (run: RetrievalRunView) => void;
}

export function RetrievalResults({ run, pending, onRetry }: RetrievalResultsProps) {
    return <section className="mt-4 min-w-0 space-y-3" aria-label="Retrieved chunks">
        {run.status === "completed" && run.chunks.length === 0 && <p className="text-sm text-muted-foreground">No chunks are available in this retrieval result. Documents may be unavailable or have been removed.</p>}
        {run.status !== "completed" && <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{run.status === "started" ? "Retrieval is running. If it was interrupted, retry after one minute." : run.errorMessage}</p>
            <button type="button" disabled={pending} onClick={() => onRetry(run)} className="min-h-11 rounded-control border border-border px-3 text-sm hover:bg-surface-muted disabled:opacity-50">Retry retrieval</button>
        </div>}
        <ol className="space-y-3">
            {run.chunks.map((chunk) => <li key={chunk.chunkId} className="min-w-0 rounded-panel border border-border bg-surface p-4">
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{chunk.rank}. {chunk.documentTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{chunk.pageNumber === null ? "Text document" : `Page ${chunk.pageNumber}`} · Revision {chunk.revision} · Similarity {chunk.semanticSimilarity.toFixed(3)}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{chunk.text}</p>
            </li>)}
        </ol>
        <details className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <summary className="cursor-pointer py-2">Retrieval details</summary>
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
    </section>;
}
