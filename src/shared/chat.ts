import type { DocumentScope, RetrievalRunView } from "@/shared/retrieval";
import type { GenerationRunView } from "@/shared/generation";

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
