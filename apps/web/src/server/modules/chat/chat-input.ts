import { z } from "zod";
import type { SendMessageInput } from "@/shared/chat";
import { parseDocumentScope } from "@/server/modules/retrieval/retrieval-input";
import type { DocumentScope } from "@/shared/retrieval";
const sendMessageInputSchema = z.object({
    conversationId: z.uuid(),
    messageId: z.uuid(),
    content: z.string().trim().min(1, "Write a message first").max(10000, "Keep messages under 10,000 characters"),
    scope: z.unknown().optional(),
});
export function parseSendMessageInput(input: unknown): SendMessageInput & { scope: DocumentScope } {
    const parsed = sendMessageInputSchema.parse(input);
    return { ...parsed, scope: parseDocumentScope(parsed.scope ?? { mode: "all" }) };
}
export function parseConversationId(input: unknown): string {
    return z.uuid().parse(input);
}
