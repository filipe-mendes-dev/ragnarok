import ReactMarkdown from "react-markdown";
import { citationLabel } from "@/shared/citations";
import type { GenerationRunView } from "@/shared/generation";
import type { RetrievedChunk } from "@/shared/retrieval";

interface AnswerContentProps {
    content: string;
    generation: GenerationRunView | undefined;
    chunks: RetrievedChunk[];
    messageId: string;
}

function linkedAnswer(content: string, selectedChunkIds: string[], chunks: RetrievedChunk[], messageId: string): string {
    return content.replace(/\[S([1-9]\d*)\]/g, (label, rawNumber: string) => {
        const number = Number(rawNumber);
        const chunkId = selectedChunkIds[number - 1];
        if (!chunkId || !chunks.some((chunk) => chunk.chunkId === chunkId)) return `${citationLabel(number)} (source unavailable)`;
        return `${citationLabel(number)}(#source-${messageId}-${number})`;
    });
}

function openSource(id: string): void {
    const source = document.getElementById(id);
    if (source instanceof HTMLDetailsElement) source.open = true;
}

export function AnswerContent({ content, generation, chunks, messageId }: AnswerContentProps) {
    if (generation?.status !== "completed") {
        return <p className="whitespace-pre-wrap text-base leading-7 [overflow-wrap:anywhere]">{content}</p>;
    }
    const answer = linkedAnswer(content, generation.selectedChunkIds, chunks, messageId);
    const linkedSources = new Map<string, { chunk: RetrievedChunk; label: string; number: number; id: string }>(generation.selectedChunkIds.flatMap((chunkId, index) => {
        const chunk = chunks.find((item) => item.chunkId === chunkId);
        const id = `source-${messageId}-${index + 1}`;
        return chunk ? [[`#${id}`, { chunk, label: citationLabel(index + 1), number: index + 1, id }] as const] : [];
    }));
    return <div className="min-w-0 space-y-3 text-base leading-7 [overflow-wrap:anywhere] [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-surface-muted [&_pre]:p-3 [&_code]:break-words">
        <ReactMarkdown
            skipHtml
            disallowedElements={["img"]}
            components={{
                a({ href, children }) {
                    const source = href ? linkedSources.get(href) : undefined;
                    return source && String(children) === String(source.number)
                        ? <a href={href} onClick={() => openSource(source.id)} className="rounded-sm font-medium text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Open source ${source.label}: ${source.chunk.documentTitle}`}>{source.label}</a>
                        : <span>{children}</span>;
                },
            }}
        >{answer}</ReactMarkdown>
    </div>;
}
