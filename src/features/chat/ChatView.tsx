"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteConversationAction, sendMessageAction } from "@/app/(authenticated)/chat/actions";
import type { ChatMessage, ConversationSummary } from "@/shared/chat";
import type { DocumentScope, RetrievalDocumentOption, RetrievalRunView } from "@/shared/retrieval";
import { RetrievalResults } from "./RetrievalResults";

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
    const [pending, startTransition] = useTransition();
    const request = useRef<{ id: string; content: string; scope: string } | null>(null);
    const scrollArea = useRef<HTMLDivElement>(null);
    const followMessages = useRef(true);
    const composer = useRef<HTMLTextAreaElement>(null);
    const sidebar = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!sidebarOpen) return;
        const previous = document.activeElement;
        sidebar.current?.querySelector<HTMLElement>("a, button")?.focus();
        return () => { if (previous instanceof HTMLElement) previous.focus(); };
    }, [sidebarOpen]);

    useEffect(() => {
        if (followMessages.current && scrollArea.current) {
            scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (!messages.some((message) => message.retrieval?.status === "started")) return;
        const timer = setInterval(() => router.refresh(), 5000);
        return () => clearInterval(timer);
    }, [messages, router]);

    function send() {
        const content = draft.trim();
        if (!content || pending) return;
        const scope: DocumentScope = scopeMode === "all" ? { mode: "all" } : { mode: "selected", documentIds: [...selectedIds].sort() };
        const scopeKey = JSON.stringify(scope);
        if (request.current?.content !== content || request.current.scope !== scopeKey) request.current = { id: crypto.randomUUID(), content, scope: scopeKey };
        const messageId = request.current.id;
        setError(null);
        startTransition(async () => {
            try {
                const result = await sendMessageAction({ conversationId, messageId, content, scope });
                if (result.errorMessage) { setError(result.errorMessage); router.refresh(); return; }
                request.current = null;
                setDraft("");
                followMessages.current = true;
                if (messages.length === 0) router.replace(`/chat/${conversationId}`);
                else router.refresh();
                composer.current?.focus();
            } catch { setError("Could not save your message. Please retry."); }
        });
    }

    function retry(run: RetrievalRunView) {
        setError(null);
        startTransition(async () => {
            try {
                const result = await sendMessageAction({ conversationId, messageId: run.messageId, content: run.query, scope: run.scope });
                setError(result.errorMessage);
                router.refresh();
            } catch { setError("Could not retry retrieval. Please try again."); }
        });
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

    return (
        <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {sidebarOpen && <button aria-label="Close conversations" className="absolute inset-0 z-10 bg-background/80 md:hidden" onClick={() => setSidebarOpen(false)} />}
            <aside ref={sidebar} id="conversation-sidebar" role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen || undefined} onKeyDown={(event) => {
                if (!sidebarOpen) return;
                if (event.key === "Escape") { setSidebarOpen(false); return; }
                if (event.key !== "Tab") return;
                const controls = Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a, button") ?? []).filter((element) => element.getClientRects().length > 0);
                const first = controls[0]; const last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }} aria-label="Conversations" className={`${sidebarOpen ? "flex absolute inset-y-0 left-0 z-20 w-[min(18rem,85vw)]" : "hidden"} min-h-0 shrink-0 flex-col border-r border-border bg-surface p-4 md:static md:flex md:w-64`}>
                <div className="flex gap-2">
                    <Link className={`${buttonClass} flex-1`} href="/chat" onClick={() => { setSidebarOpen(false); if (messages.length === 0) { setDraft(""); setError(null); request.current = null; } }}>New conversation</Link>
                    <button className={`${buttonClass} md:hidden`} onClick={() => setSidebarOpen(false)} aria-label="Close conversations">Close</button>
                </div>
                <nav aria-label="Conversation history" className="mt-4 min-h-0 flex-1 overflow-y-auto">
                    {conversations.length === 0 && <p className="px-2 text-sm text-muted-foreground">Your conversations will appear here.</p>}
                    <ul className="space-y-1">
                        {conversations.map((item) => <li key={item.id}><Link aria-current={item.id === conversationId ? "page" : undefined} className={`block truncate rounded-control px-3 py-3 text-sm hover:bg-surface-muted ${item.id === conversationId ? "bg-surface-muted font-medium" : "text-muted-foreground"}`} title={item.title} href={`/chat/${item.id}`} onClick={() => setSidebarOpen(false)}>{item.title}</Link></li>)}
                    </ul>
                </nav>
            </aside>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Chat">
                <div className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
                    <button className={`${buttonClass} md:hidden`} aria-controls="conversation-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>Conversations</button>
                    <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</h1>
                    {messages.length > 0 && <button className={buttonClass} disabled={pending} onClick={removeConversation}>Remove</button>}
                </div>
                <div ref={scrollArea} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6" onScroll={() => { const area = scrollArea.current; if (area) followMessages.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100; }}>
                    <div className="mx-auto max-w-3xl py-8">
                        {messages.length === 0 ? <div className="py-12"><h2 className="text-2xl font-semibold tracking-tight">Ask about your documents</h2><p className="mt-3 text-sm text-muted-foreground">Search completed documents and inspect the retrieved chunks. Generation is not implemented yet.</p><Link className="mt-4 inline-block text-sm text-accent underline" href="/documents/new">Add documents</Link></div> :
                            <ol className="space-y-6" aria-label="Messages" aria-live="polite" aria-relevant="additions">
                                {messages.map((message) => <li key={message.id} className={message.role === "user" ? "ml-auto w-fit max-w-[90%] rounded-panel border border-border bg-surface-muted px-4 py-3" : "max-w-full py-2"}><p className="mb-2 text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : "RAGnarok"}</p><p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{message.content}</p>{message.retrieval && <RetrievalResults run={message.retrieval} pending={pending} onRetry={retry} />}</li>)}
                            </ol>}
                    </div>
                </div>
                <form className="shrink-0 border-t border-border bg-surface px-4 py-4 sm:px-6" onSubmit={(event) => { event.preventDefault(); send(); }}>
                    <div className="mx-auto max-w-3xl">
                        {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
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
                            <button type="submit" disabled={pending || !draft.trim() || (scopeMode === "selected" && selectedIds.length === 0)} className="min-h-11 shrink-0 rounded-control bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">{pending ? "Searching…" : "Send"}</button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Ask a short, self-contained question in English. Each search uses only your latest message. Generation is not implemented yet.</p>
                    </div>
                </form>
            </section>
        </main>
    );
}
