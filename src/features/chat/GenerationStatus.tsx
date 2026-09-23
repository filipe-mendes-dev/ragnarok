import type { GenerationRunView } from "@/shared/generation";
import type { RetrievalRunView } from "@/shared/retrieval";

interface GenerationStatusProps {
    generation: GenerationRunView | undefined;
    retrieval: RetrievalRunView;
    pending: boolean;
    onRetry: (run: RetrievalRunView) => void;
}

export function GenerationStatus({ generation, retrieval, pending, onRetry }: GenerationStatusProps) {
    if (retrieval.status !== "completed") return null;
    if (!generation || generation.status === "failed") {
        return <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted-foreground">{generation?.errorMessage ?? "This answer has not been generated yet."}</p>
            <button type="button" disabled={pending} onClick={() => onRetry(retrieval)} className="min-h-11 rounded-control border border-border px-3 hover:bg-surface-muted disabled:opacity-50">{generation ? "Retry generation" : "Generate answer"}</button>
            {generation && <GenerationDetails generation={generation} />}
        </div>;
    }
    if (generation.status === "started") {
        return <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted-foreground">Generation is running. If it was interrupted, retry after one minute.</p>
            <button type="button" disabled={pending} onClick={() => onRetry(retrieval)} className="min-h-11 rounded-control border border-border px-3 hover:bg-surface-muted disabled:opacity-50">Retry generation</button>
        </div>;
    }
    return <GenerationDetails generation={generation} />;
}

function GenerationDetails({ generation }: { generation: GenerationRunView }) {
    return <details className="mt-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <summary className="cursor-pointer py-2">Generation details</summary>
        <dl className="space-y-2">
            <div><dt>Trace ID</dt><dd>{generation.traceId}</dd></div>
            <div><dt>Attempt ID</dt><dd>{generation.attemptId}</dd></div>
            <div><dt>Prompt version</dt><dd>{generation.promptVersion}</dd></div>
            {generation.errorCode && <div><dt>Error code</dt><dd>{generation.errorCode}</dd></div>}
            {generation.provider && <div><dt>Provider</dt><dd>{generation.provider}</dd></div>}
            {generation.requestedModel && <div><dt>Requested model</dt><dd className="[overflow-wrap:anywhere]">{generation.requestedModel}</dd></div>}
            <div><dt>Model</dt><dd className="[overflow-wrap:anywhere]">{generation.responseModel ?? "No model call"}</dd></div>
            {generation.providerResponseId && <div><dt>Provider response</dt><dd>{generation.providerResponseId}</dd></div>}
            {generation.finishReason && <div><dt>Finish reason</dt><dd>{generation.finishReason}</dd></div>}
            {generation.httpStatus !== null && <div><dt>HTTP status</dt><dd>{generation.httpStatus}</dd></div>}
            {generation.latencyMs !== null && <div><dt>Duration</dt><dd>{generation.latencyMs} ms</dd></div>}
            {generation.inputTokens !== null && <div><dt>Input tokens</dt><dd>{generation.inputTokens}</dd></div>}
            {generation.outputTokens !== null && <div><dt>Output tokens</dt><dd>{generation.outputTokens}</dd></div>}
            {generation.reasoningTokens !== null && <div><dt>Reasoning tokens</dt><dd>{generation.reasoningTokens}</dd></div>}
            {generation.totalTokens !== null && <div><dt>Total tokens</dt><dd>{generation.totalTokens}</dd></div>}
        </dl>
    </details>;
}
