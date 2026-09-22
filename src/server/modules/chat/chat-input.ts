import { z } from "zod";
import type { SendMessageInput } from "@/shared/chat";
const sendMessageInputSchema = z.object({
    conversationId: z.uuid(),
    messageId: z.uuid(),
    content: z.string().trim().min(1, "Write a message first").max(10000, "Keep messages under 10,000 characters"),
});
export function parseSendMessageInput(input: unknown): SendMessageInput {
    return sendMessageInputSchema.parse(input);
}
export function parseConversationId(input: unknown): string {
    return z.uuid().parse(input);
}
