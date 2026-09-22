"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteConversationAction, sendMessageAction } from "@/app/(authenticated)/chat/actions";
import type { ChatMessage, ConversationSummary } from "@/shared/chat";

interface ChatViewProps {
    conversationId: string;
    conversations: ConversationSummary[];
    messages: ChatMessage[];
    title: string;
}
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-control border border-border px-3 text-sm hover:bg-surface-muted disabled:opacity-50";

export function ChatView({ conversationId, conversations, messages, title }: ChatViewProps) {
    const router = useRouter();
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const request = useRef<{ id: string; content: string } | null>(null);
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

    function send() {
        const content = draft.trim();
        if (!content || pending) return;
        if (request.current?.content !== content) request.current = { id: crypto.randomUUID(), content };
        const messageId = request.current.id;
        setError(null);
        startTransition(async () => {
            try {
                const result = await sendMessageAction({ conversationId, messageId, content });
                if (result.errorMessage) { setError(result.errorMessage); return; }
                request.current = null;
                setDraft("");
                followMessages.current = true;
                if (messages.length === 0) router.replace(`/chat/${conversationId}`);
                else router.refresh();
                composer.current?.focus();
            } catch { setError("Could not save your message. Please retry."); }
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
                        {messages.length === 0 ? <div className="py-12"><h2 className="text-2xl font-semibold tracking-tight">Ask about your documents</h2><p className="mt-3 text-sm text-muted-foreground">Start a conversation. Answers coming later.</p><Link className="mt-4 inline-block text-sm text-accent underline" href="/documents/new">Add documents</Link></div> :
                            <ol className="space-y-6" aria-label="Messages" aria-live="polite" aria-relevant="additions">
                                {messages.map((message) => <li key={message.id} className={message.role === "user" ? "ml-auto w-fit max-w-[90%] rounded-panel border border-border bg-surface-muted px-4 py-3" : "max-w-full py-2"}><p className="mb-2 text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : "RAGnarok"}</p><p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{message.content}</p></li>)}
                            </ol>}
                    </div>
                </div>
                <form className="shrink-0 border-t border-border bg-surface px-4 py-4 sm:px-6" onSubmit={(event) => { event.preventDefault(); send(); }}>
                    <div className="mx-auto max-w-3xl">
                        {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
                        <label className="sr-only" htmlFor="chat-message">Message</label>
                        <div className="flex items-end gap-2 rounded-panel border border-border p-2 focus-within:border-accent">
                            <textarea ref={composer} id="chat-message" rows={2} maxLength={10000} value={draft} disabled={pending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder="Ask a question…" className="max-h-40 min-h-12 min-w-0 flex-1 resize-y rounded-control bg-transparent px-2 py-2 text-sm" />
                            <button type="submit" disabled={pending || !draft.trim()} className="min-h-11 shrink-0 rounded-control bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">{pending ? "Saving…" : "Send"}</button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Answers coming later. Messages are saved to your private history.</p>
                    </div>
                </form>
            </section>
        </main>
    );
}
