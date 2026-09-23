import { randomUUID } from "node:crypto";
import { ChatView } from "@/features/chat/ChatView";
import { requireCurrentUser } from "@/server/auth/session";
import { chatService, retrievalService } from "@/server/modules/chat/chat-runtime";

export default async function ChatPage() {
    const user = await requireCurrentUser();
    const [conversations, documents] = await Promise.all([
        chatService.listConversations(user.id),
        retrievalService.listDocuments(user.id),
    ]);

    return (
        <ChatView
            key="new"
            conversationId={randomUUID()}
            conversations={conversations}
            documents={documents}
            messages={[]}
            title="New conversation"
        />
    );
}
