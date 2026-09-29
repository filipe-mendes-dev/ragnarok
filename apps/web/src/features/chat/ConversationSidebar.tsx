"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { ConversationSummary } from "@/shared/chat";

interface ConversationSidebarProps {
    activeConversationId: string;
    conversations: ConversationSummary[];
    open: boolean;
    onClose: () => void;
    onNewConversation: () => void;
}

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-control border border-border px-3 text-sm hover:bg-surface-muted disabled:opacity-50";

export function ConversationSidebar({ activeConversationId, conversations, open, onClose, onNewConversation }: ConversationSidebarProps) {
    const sidebar = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        sidebar.current?.querySelector<HTMLElement>("a, button")?.focus();
        return () => { if (previous instanceof HTMLElement) previous.focus(); };
    }, [open]);

    function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
        if (!open) return;
        if (event.key === "Escape") { onClose(); return; }
        if (event.key !== "Tab") return;
        const controls = Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a, button") ?? []).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }

    function handleNewConversation(): void {
        onClose();
        onNewConversation();
    }

    return (
        <>
            {open && <button aria-label="Close conversations" className="absolute inset-0 z-10 bg-background/80 md:hidden" onClick={onClose} />}
            <aside
                ref={sidebar}
                id="conversation-sidebar"
                role={open ? "dialog" : undefined}
                aria-modal={open || undefined}
                onKeyDown={handleKeyDown}
                aria-label="Conversations"
                className={`${open ? "flex absolute inset-y-0 left-0 z-20 w-[min(18rem,85vw)]" : "hidden"} min-h-0 shrink-0 flex-col border-r border-border bg-surface p-4 md:static md:flex md:w-64`}
            >
                <div className="flex gap-2">
                    <Link className={`${buttonClass} flex-1`} href="/chat" onClick={handleNewConversation}>New conversation</Link>
                    <button className={`${buttonClass} md:hidden`} onClick={onClose} aria-label="Close conversations">Close</button>
                </div>
                <nav aria-label="Conversation history" className="mt-4 min-h-0 flex-1 overflow-y-auto">
                    {conversations.length === 0 && <p className="px-2 text-sm text-muted-foreground">Your conversations will appear here.</p>}
                    <ul className="space-y-1">
                        {conversations.map((item) => (
                            <li key={item.id}>
                                <Link
                                    aria-current={item.id === activeConversationId ? "page" : undefined}
                                    className={`block truncate rounded-control px-3 py-3 text-sm hover:bg-surface-muted ${item.id === activeConversationId ? "bg-surface-muted font-medium" : "text-muted-foreground"}`}
                                    title={item.title}
                                    href={`/chat/${item.id}`}
                                    onClick={onClose}
                                >
                                    {item.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
        </>
    );
}
