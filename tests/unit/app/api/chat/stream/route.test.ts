import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/modules/chat/chat-runtime", () => ({ chatService: { sendMessage: vi.fn() } }));

import { POST } from "@/app/api/chat/stream/route";
import { getCurrentUser } from "@/server/auth/session";
import { chatService } from "@/server/modules/chat/chat-runtime";

function request(origin = "http://localhost"): Request {
    return new Request("http://localhost/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Host: "localhost", Origin: origin },
        body: JSON.stringify({ conversationId: "conversation-id", messageId: "message-id", content: "Question" }),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("POST /api/chat/stream", () => {
    it("rejects cross-origin requests and unauthenticated users", async () => {
        expect((await POST(request("https://other.example"))).status).toBe(403);
        vi.mocked(getCurrentUser).mockResolvedValue(null);
        expect((await POST(request())).status).toBe(401);
        expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it("caps request bodies before calling the chat service", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-id", email: "owner@example.com", image: null, name: "Owner" });
        const oversized = new Request("http://localhost/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json", Host: "localhost", Origin: "http://localhost" },
            body: JSON.stringify({ content: "x".repeat(50_000) }),
        });
        const response = await POST(oversized);
        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({ errorMessage: "Message is too large" });
        expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it("does not classify an unrelated range error as an oversized body", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-id", email: "owner@example.com", image: null, name: "Owner" });
        const broken = request();
        Object.defineProperty(broken, "body", {
            value: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.error(new RangeError("Read failed"));
                },
            }),
        });

        const response = await POST(broken);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ errorMessage: "Invalid message" });
        expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it("emits the saved completion through SSE after the owned service call", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-id", email: "owner@example.com", image: null, name: "Owner" });
        vi.mocked(chatService.sendMessage).mockImplementation(async (_userId, _input, options) => {
            options?.onEvent?.({ type: "accepted", messageId: "message-id", responseMessageId: "answer-id", stage: "generation" });
            options?.onEvent?.({ type: "completed", content: "Answer [S1]" });
        });

        const response = await POST(request());
        const body = await response.text();

        expect(response.headers.get("Content-Type")).toContain("text/event-stream");
        expect(response.headers.get("X-Accel-Buffering")).toBe("no");
        expect(chatService.sendMessage).toHaveBeenCalledWith("owner-id", expect.objectContaining({ content: "Question" }), expect.objectContaining({ onEvent: expect.any(Function) }));
        expect(body).toContain('"type":"accepted"');
        expect(body).toContain('"type":"completed"');
    });

    it("passes stream cancellation to the chat service", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-id", email: "owner@example.com", image: null, name: "Owner" });
        let serviceSignal: AbortSignal | undefined;
        vi.mocked(chatService.sendMessage).mockImplementation(async (_userId, _input, options) => {
            serviceSignal = options?.signal;
            await new Promise<void>((resolve) => serviceSignal?.addEventListener("abort", () => resolve(), { once: true }));
        });

        const response = await POST(request());
        expect(serviceSignal?.aborted).toBe(false);
        await response.body?.cancel();
        expect(serviceSignal?.aborted).toBe(true);
    });
});
