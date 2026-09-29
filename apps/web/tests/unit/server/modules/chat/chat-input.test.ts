import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSendMessageInput } from "@/server/modules/chat/chat-input";

describe("parseSendMessageInput", () => {
    it("trims a question while retaining internal line breaks", () => {
        const input = { conversationId: randomUUID(), messageId: randomUUID(), content: "  First\nSecond  " };
        expect(parseSendMessageInput(input)).toEqual({ ...input, content: "First\nSecond", scope: { mode: "all" } });
    });
    it.each(["  \n", "x".repeat(10001), null, 42])("rejects invalid message content", (content) => {
        expect(() => parseSendMessageInput({ conversationId: randomUUID(), messageId: randomUUID(), content })).toThrow();
    });
    it("rejects malformed conversation and request identifiers", () => {
        expect(() => parseSendMessageInput({ conversationId: "invalid", messageId: randomUUID(), content: "Question" })).toThrow();
        expect(() => parseSendMessageInput({ conversationId: randomUUID(), messageId: "invalid", content: "Question" })).toThrow();
    });
});
