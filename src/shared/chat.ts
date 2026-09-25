import type { DocumentScope, RetrievalRunView } from "@/shared/retrieval";
import type { GenerationRunView } from "@/shared/generation";

export const CHAT_STALE_ATTEMPT_MS = 60_000;

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    retrieval?: RetrievalRunView;
    generation?: GenerationRunView;
}
export interface ConversationSummary {
    id: string;
    title: string;
}
export interface SendMessageInput {
    conversationId: string;
    messageId: string;
    content: string;
    scope?: DocumentScope;
}
export interface ChatActionResult {
    errorMessage: string | null;
}

export type ChatStreamEvent =
    | { type: "accepted"; messageId: string; responseMessageId: string; stage: "retrieval" | "generation" }
    | { type: "stage"; stage: "generation" }
    | { type: "delta"; text: string }
    | { type: "completed"; content: string | null }
    | { type: "error"; message: string };
