import { notFound } from "next/navigation";
import { ChatView } from "@/features/chat/ChatView";
import { requireCurrentUser } from "@/server/auth/session";
import { parseConversationId } from "@/server/modules/chat/chat-input";
import { chatService, retrievalService } from "@/server/modules/chat/chat-runtime";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
    const user = await requireCurrentUser();
    const { conversationId } = await params;
    try { parseConversationId(conversationId); } catch { notFound(); }
    const current = await chatService.getConversation(user.id, conversationId);
    if (!current) notFound();
    const [conversations, documents] = await Promise.all([
        chatService.listConversations(user.id),
        retrievalService.listDocuments(user.id),
    ]);

    return (
        <ChatView
            key={conversationId}
            conversationId={conversationId}
            conversations={conversations}
            documents={documents}
            messages={current.messages}
            title={current.title}
        />
    );
}
