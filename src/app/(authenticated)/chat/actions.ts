"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireCurrentUser } from "@/server/auth/session";
import { database } from "@/server/db/client";
import { ChatError, createChatService } from "@/server/modules/chat/chat-service";
import type { ChatActionResult, SendMessageInput } from "@/shared/chat";

export async function sendMessageAction(input: SendMessageInput): Promise<ChatActionResult> {
    const user = await requireCurrentUser();
    try {
        await createChatService(database).sendMessage(user.id, input);
        revalidatePath("/chat", "layout");
        return { errorMessage: null };
    } catch (error: unknown) {
        return { errorMessage: error instanceof ZodError ? error.issues[0]?.message ?? "Invalid message" : error instanceof ChatError ? error.message : "Could not save your message. Please retry." };
    }
}
export async function deleteConversationAction(id: string): Promise<ChatActionResult> {
    const user = await requireCurrentUser();
    try {
        await createChatService(database).deleteConversation(user.id, id);
        revalidatePath("/chat", "layout");
        return { errorMessage: null };
    } catch {
        return { errorMessage: "Could not remove this conversation. Please retry." };
    }
}
