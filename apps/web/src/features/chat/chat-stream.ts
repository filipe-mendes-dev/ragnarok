import { createParser } from "eventsource-parser";
import { z } from "zod";
import type { ChatStreamEvent, SendMessageInput } from "@/shared/chat";

const chatEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("accepted"), messageId: z.string(), responseMessageId: z.string(), stage: z.enum(["retrieval", "generation"]) }),
    z.object({ type: z.literal("stage"), stage: z.literal("generation") }),
    z.object({ type: z.literal("delta"), text: z.string() }),
    z.object({ type: z.literal("completed"), content: z.string().nullable() }),
    z.object({ type: z.literal("error"), message: z.string() }),
]);

export async function streamChat(input: SendMessageInput, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<void> {
    const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal,
        cache: "no-store",
    });
    if (!response.ok || !response.body) {
        if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
        if (response.status === 413) throw new Error("Message is too large. Shorten it and retry.");
        throw new Error("Could not start the answer. Please retry.");
    }
    let terminal = false;
    const parser = createParser({
        onEvent(frame) {
            let payload: unknown;
            try {
                payload = JSON.parse(frame.data) as unknown;
            } catch {
                throw new Error("The answer stream was interrupted. Refresh and retry.");
            }
            const parsed = chatEventSchema.safeParse(payload);
            if (!parsed.success) throw new Error("The answer stream was interrupted. Refresh and retry.");
            if (parsed.data.type === "completed" || parsed.data.type === "error") terminal = true;
            onEvent(parsed.data);
        },
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            parser.feed(decoder.decode(next.value, { stream: true }));
        }
        parser.feed(decoder.decode());
        if (!terminal) throw new Error("The answer stream was interrupted. Refresh and retry.");
    } finally {
        if (!terminal) await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
