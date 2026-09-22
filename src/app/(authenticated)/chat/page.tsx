import { randomUUID } from "node:crypto";
import { ChatView } from "@/features/chat/ChatView";
import { requireCurrentUser } from "@/server/auth/session";
import { database } from "@/server/db/client";
import { createChatService } from "@/server/modules/chat/chat-service";
export default async function ChatPage() {
    const user = await requireCurrentUser();
    return <ChatView key="new" conversationId={randomUUID()} conversations={await createChatService(database).listConversations(user.id)} messages={[]} title="New conversation" />;
}
