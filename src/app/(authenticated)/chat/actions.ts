"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireCurrentUser } from "@/server/auth/session";
import { ChatError } from "@/server/modules/chat/chat-service";
import { chatService } from "@/server/modules/chat/chat-runtime";
import type { ChatActionResult, SendMessageInput } from "@/shared/chat";

export async function sendMessageAction(input: SendMessageInput): Promise<ChatActionResult> {
    const user = await requireCurrentUser();
    try {
        await chatService.sendMessage(user.id, input);
        revalidatePath("/chat", "layout");
        return { errorMessage: null };
    } catch (error: unknown) {
        revalidatePath("/chat", "layout");
        return { errorMessage: error instanceof ZodError ? error.issues[0]?.message ?? "Invalid message" : error instanceof ChatError ? error.message : "Could not save your message. Please retry." };
    }
}
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
