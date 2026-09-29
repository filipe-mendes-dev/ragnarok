import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "@/features/chat/chat-stream";
import type { ChatStreamEvent } from "@/shared/chat";

const input = { conversationId: "conversation-id", messageId: "message-id", content: "Question" };

function streamResponse(text: string): Response {
    const bytes = new TextEncoder().encode(text);
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 5) controller.enqueue(bytes.slice(offset, offset + 5));
            controller.close();
        },
    }));
}

function event(value: ChatStreamEvent): string {
    return `data: ${JSON.stringify(value)}\n\n`;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamChat", () => {
    it("reads fragmented events and reaches a durable completion", async () => {
        const events: ChatStreamEvent[] = [];
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(streamResponse(
            event({ type: "accepted", messageId: "message-id", responseMessageId: "answer-id", stage: "retrieval" }) +
            event({ type: "stage", stage: "generation" }) +
            event({ type: "delta", text: "Answer " }) +
            event({ type: "delta", text: "[S1]" }) +
            event({ type: "completed", content: "Answer [S1]" }),
        ));
        vi.stubGlobal("fetch", fetcher);

        await streamChat(input, (item) => events.push(item), new AbortController().signal);

        expect(events.map((item) => item.type)).toEqual(["accepted", "stage", "delta", "delta", "completed"]);
        expect(fetcher).toHaveBeenCalledWith("/api/chat/stream", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
    });

    it("rejects a disconnected stream without a terminal event", async () => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(streamResponse(event({ type: "delta", text: "Partial" }))));
        await expect(streamChat(input, () => {}, new AbortController().signal)).rejects.toThrow("interrupted");
    });

    it("reports an expired session before reading a stream", async () => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
        await expect(streamChat(input, () => {}, new AbortController().signal)).rejects.toThrow("session expired");
    });

    it("reports an oversized request before reading a stream", async () => {
        const response = Response.json({ errorMessage: "Message is too large" }, { status: 413 });
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
        await expect(streamChat(input, () => {}, new AbortController().signal)).rejects.toThrow("Message is too large. Shorten it and retry.");
    });
});
