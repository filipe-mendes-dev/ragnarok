export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
}
export interface ConversationSummary {
    id: string;
    title: string;
}
export interface SendMessageInput {
    conversationId: string;
    messageId: string;
    content: string;
}
export interface ChatActionResult {
    errorMessage: string | null;
}
