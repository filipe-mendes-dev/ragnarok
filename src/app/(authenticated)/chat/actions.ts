"use server";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/session";
import { chatService } from "@/server/modules/chat/chat-runtime";
import type { ChatActionResult } from "@/shared/chat";
export async function deleteConversationAction(id: string): Promise<ChatActionResult> {
    const user = await requireCurrentUser();
    try {
        await chatService.deleteConversation(user.id, id);
        revalidatePath("/chat", "layout");
        return { errorMessage: null };
    } catch {
        return { errorMessage: "Could not remove this conversation. Please retry." };
    }
}
