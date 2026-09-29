"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteConversationAction } from "@/app/(authenticated)/chat/actions";
import type { ChatMessage, ConversationSummary, SendMessageInput } from "@/shared/chat";
import type { DocumentScope, RetrievalDocumentOption, RetrievalRunView } from "@/shared/retrieval";
import { ConversationSidebar } from "./ConversationSidebar";
import { RetrievalResults } from "./RetrievalResults";
import { GenerationStatus } from "./GenerationStatus";
import { AnswerContent } from "./AnswerContent";
import { streamChat } from "./chat-stream";

interface ChatViewProps {
    conversationId: string;
    conversations: ConversationSummary[];
    messages: ChatMessage[];
    title: string;
    documents: RetrievalDocumentOption[];
}
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-control border border-border px-3 text-sm hover:bg-surface-muted disabled:opacity-50";

export function ChatView({ conversationId: initialConversationId, conversations, messages, title, documents }: ChatViewProps) {
    const router = useRouter();
    const [conversationId] = useState(initialConversationId);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [transitionPending, startTransition] = useTransition();
    const [streaming, setStreaming] = useState(false);
    const [streamStage, setStreamStage] = useState<string | null>(null);
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
    const [settledAnswer, setSettledAnswer] = useState<{ id: string; content: string } | null>(null);
    const pending = transitionPending || streaming;
    const request = useRef<{ id: string; content: string; scope: string } | null>(null);
    const activeStream = useRef<AbortController | null>(null);
    const scrollArea = useRef<HTMLDivElement>(null);
    const followMessages = useRef(true);
    const composer = useRef<HTMLTextAreaElement>(null);

    const serverIds = new Set(messages.map((message) => message.id));
    const activeLocal = localMessages.filter((local) => {
        const saved = messages.find((message) => message.id === local.id);
        return !saved || (streaming && activeResponseId === local.id) ||
            (settledAnswer?.id === local.id && saved.content !== settledAnswer.content) ||
            saved.retrieval?.status === "started" || saved.generation?.status === "started";
    });
    const localById = new Map(activeLocal.map((message) => [message.id, message]));
    const visibleMessages = [...messages.map((message) => localById.get(message.id) ?? message), ...activeLocal.filter((message) => !serverIds.has(message.id))];

    useEffect(() => {
        if (followMessages.current && scrollArea.current) {
            scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
        }
    }, [messages, localMessages]);

    useEffect(() => {
        if (streaming || !messages.some((message) => message.retrieval?.status === "started" || message.generation?.status === "started")) return;
        const timer = setInterval(() => router.refresh(), 5000);
        return () => clearInterval(timer);
    }, [messages, router, streaming]);

    useEffect(() => () => activeStream.current?.abort(), []);

    async function runStream(input: SendMessageInput, clearDraft: boolean): Promise<void> {
        const controller = new AbortController();
        activeStream.current = controller;
        setStreaming(true);
        setError(null);
        setStreamStage("Saving question…");
        setActiveResponseId(null);
        setSettledAnswer(null);
        let responseMessageId: string | null = null;
        let receivedText = "";
        let accepted = false;
        try {
            await streamChat(input, (event) => {
                if (event.type === "accepted") {
                    accepted = true;
                    responseMessageId = event.responseMessageId;
                    setActiveResponseId(event.responseMessageId);
                    setStreamStage(event.stage === "retrieval" ? "Finding evidence…" : "Generating answer…");
                    setLocalMessages((current) => [
                        ...current.filter((message) => message.id !== input.messageId && message.id !== event.responseMessageId),
                        { id: input.messageId, role: "user", content: input.content },
                        { id: event.responseMessageId, role: "assistant", content: event.stage === "retrieval" ? "Finding evidence…" : "Generating answer…" },
                    ]);
                    if (clearDraft) {
                        setDraft("");
                        request.current = null;
                    }
                    followMessages.current = true;
                } else if (event.type === "stage") {
                    setStreamStage("Generating answer…");
                    if (responseMessageId && !receivedText) {
                        setLocalMessages((current) => current.map((message) => message.id === responseMessageId ? { ...message, content: "Generating answer…" } : message));
                    }
                } else if (event.type === "delta") {
                    receivedText += event.text;
                    setStreamStage("Writing answer…");
                    if (responseMessageId) {
                        const content = receivedText;
                        setLocalMessages((current) => current.map((message) => message.id === responseMessageId ? { ...message, content } : message));
                    }
                } else if (event.type === "completed") {
                    activeStream.current = null;
                    if (responseMessageId && event.content !== null) {
                        const content = event.content;
                        setSettledAnswer({ id: responseMessageId, content });
                        setLocalMessages((current) => current.map((message) => message.id === responseMessageId ? { ...message, content } : message));
                    }
                    setStreamStage(null);
                    if (messages.length === 0 && clearDraft) router.replace(`/chat/${conversationId}`);
                    else router.refresh();
                } else {
                    activeStream.current = null;
                    setError(event.message);
                    setStreamStage(null);
                    if (responseMessageId) {
                        setLocalMessages((current) => current.map((message) => message.id === responseMessageId ? { ...message, content: event.message } : message));
                    }
                    router.refresh();
                }
            }, controller.signal);
        } catch (error: unknown) {
            const stopped = controller.signal.aborted;
            if (!stopped) controller.abort();
            const message = stopped ? "Response stopped. You can retry this question." : error instanceof Error ? error.message : "The answer stream was interrupted. Refresh and retry.";
            setError(message);
            if (responseMessageId) {
                setLocalMessages((current) => current.map((item) => item.id === responseMessageId ? { ...item, content: message } : item));
            }
            setStreamStage(null);
            if (accepted) router.refresh();
        } finally {
            activeStream.current = null;
            setStreaming(false);
            composer.current?.focus();
        }
    }

    function send() {
        const content = draft.trim();
        if (!content || pending) return;
        const scope: DocumentScope = scopeMode === "all" ? { mode: "all" } : { mode: "selected", documentIds: [...selectedIds].sort() };
        const scopeKey = JSON.stringify(scope);
        if (request.current?.content !== content || request.current.scope !== scopeKey) request.current = { id: crypto.randomUUID(), content, scope: scopeKey };
        const messageId = request.current.id;
        void runStream({ conversationId, messageId, content, scope }, true);
    }

    function retry(run: RetrievalRunView) {
        if (pending) return;
        void runStream({ conversationId, messageId: run.messageId, content: run.query, scope: run.scope }, false);
    }

    function removeConversation() {
        if (!window.confirm("Remove this conversation and all its messages?")) return;
        startTransition(async () => {
            try {
                const result = await deleteConversationAction(conversationId);
                if (result.errorMessage) { setError(result.errorMessage); return; }
                router.push("/chat");
                router.refresh();
            } catch { setError("Could not remove this conversation. Please retry."); }
        });
    }

    function resetNewConversation() {
        if (messages.length > 0) return;
        activeStream.current?.abort();
        setLocalMessages([]);
        setActiveResponseId(null);
        setSettledAnswer(null);
        setDraft("");
        setError(null);
        request.current = null;
        router.refresh();
    }

    return (
        <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <ConversationSidebar
                activeConversationId={conversationId}
                conversations={conversations}
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onNewConversation={resetNewConversation}
            />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Chat">
                <div className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
                    <button className={`${buttonClass} md:hidden`} aria-controls="conversation-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>Conversations</button>
                    <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</h1>
                    {visibleMessages.length > 0 && <button className={buttonClass} disabled={pending} onClick={removeConversation}>Remove</button>}
                </div>
                <div ref={scrollArea} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6" onScroll={() => { const area = scrollArea.current; if (area) followMessages.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100; }}>
                    <div className="mx-auto max-w-3xl py-8">
                        {visibleMessages.length === 0 ? <div className="py-12"><h2 className="text-2xl font-semibold tracking-tight">Ask about your documents</h2><p className="mt-3 text-sm text-muted-foreground">Ask a question about completed documents and inspect the answer sources.</p><Link className="mt-4 inline-block text-sm text-accent underline" href="/documents/new">Add documents</Link></div> :
                            <ol className="space-y-6" aria-label="Messages" aria-live="polite" aria-relevant="additions">
                                {visibleMessages.map((message) => <li key={message.id} className={message.role === "user" ? "ml-auto w-fit max-w-[90%] rounded-panel bg-accent px-4 py-3 text-accent-foreground" : "max-w-full py-2"}>
                                    <p className={message.role === "user" ? "mb-2 text-xs font-medium text-accent-foreground" : "mb-2 text-xs font-medium text-muted-foreground"}>{message.role === "user" ? "You" : "RAGnarok"}</p>
                                    {message.role === "user"
                                        ? <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{message.content}</p>
                                        : <AnswerContent content={message.content} generation={message.generation} chunks={message.retrieval?.chunks ?? []} messageId={message.id} />}
                                    {message.retrieval && <>
                                        {message.generation?.status !== "completed" && <GenerationStatus generation={message.generation} retrieval={message.retrieval} pending={pending} onRetry={retry} />}
                                        <RetrievalResults run={message.retrieval} generation={message.generation} answer={message.content} messageId={message.id} pending={pending} onRetry={retry} />
                                        {message.generation?.status === "completed" && <GenerationStatus generation={message.generation} retrieval={message.retrieval} pending={pending} onRetry={retry} />}
                                    </>}
                                </li>)}
                            </ol>}
                    </div>
                </div>
                <form className="shrink-0 border-t border-border bg-surface px-4 py-4 sm:px-6" onSubmit={(event) => { event.preventDefault(); send(); }}>
                    <div className="mx-auto max-w-3xl">
                        {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
                        <p role="status" className="mb-2 min-h-5 text-xs text-muted-foreground">{streamStage}</p>
                        <details className="mb-3 text-sm">
                            <summary className="cursor-pointer py-2">Search {scopeMode === "all" ? "all eligible documents" : `${selectedIds.length} selected documents`}</summary>
                            <fieldset disabled={pending} className="space-y-2 py-2">
                                <legend className="sr-only">Document scope</legend>
                                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="scope" checked={scopeMode === "all"} onChange={() => setScopeMode("all")} />All eligible documents</label>
                                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="scope" checked={scopeMode === "selected"} onChange={() => setScopeMode("selected")} />Choose documents</label>
                                {scopeMode === "selected" && <div className="max-h-36 overflow-y-auto">
                                    {documents.length === 0 && <p className="text-muted-foreground">No completed, embedded documents are available.</p>}
                                    {documents.map((document) => <label key={document.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selectedIds.includes(document.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id))} /><span className="min-w-0 [overflow-wrap:anywhere]">{document.title}</span></label>)}
                                </div>}
                            </fieldset>
                        </details>
                        <label className="sr-only" htmlFor="chat-message">Message</label>
                        <div className="flex items-end gap-2 rounded-panel border border-border p-2 focus-within:border-accent">
                            <textarea ref={composer} id="chat-message" rows={2} maxLength={10000} value={draft} disabled={pending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder="Ask a question…" className="max-h-40 min-h-12 min-w-0 flex-1 resize-y rounded-control bg-transparent px-2 py-2 text-sm" />
                            {streaming
                                ? <button type="button" onClick={() => activeStream.current?.abort()} className="min-h-11 shrink-0 rounded-control border border-border px-4 text-sm font-semibold hover:bg-surface-muted">Stop</button>
                                : <button type="submit" disabled={pending || !draft.trim() || (scopeMode === "selected" && selectedIds.length === 0)} className="min-h-11 shrink-0 rounded-control bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">{transitionPending ? "Working…" : "Send"}</button>}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Ask a short, self-contained question in English. Each answer uses only your latest question and retrieved document excerpts.</p>
                    </div>
                </form>
            </section>
        </main>
    );
}
