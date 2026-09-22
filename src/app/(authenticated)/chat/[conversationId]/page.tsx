import { notFound } from "next/navigation";
import { ChatView } from "@/features/chat/ChatView";
import { requireCurrentUser } from "@/server/auth/session";
import { database } from "@/server/db/client";
import { parseConversationId } from "@/server/modules/chat/chat-input";
import { createChatService } from "@/server/modules/chat/chat-service";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";
export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
    const user = await requireCurrentUser();
    const { conversationId } = await params;
    try { parseConversationId(conversationId); } catch { notFound(); }
    const service = createChatService(database);
    const current = await service.getConversation(user.id, conversationId);
    if (!current) notFound();
    return <ChatView key={conversationId} conversationId={conversationId} conversations={await service.listConversations(user.id)} documents={await createRetrievalService(database).listDocuments(user.id)} messages={current.messages} title={current.title} />;
}
