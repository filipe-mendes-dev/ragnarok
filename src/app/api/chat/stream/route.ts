import { ZodError } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { ChatError } from "@/server/modules/chat/chat-service";
import { chatService } from "@/server/modules/chat/chat-runtime";
import type { ChatStreamEvent } from "@/shared/chat";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 48_000;

class RequestBodyTooLargeError extends Error {}

function isSameOrigin(request: Request): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return true;
    try {
        return new URL(origin).host === request.headers.get("host");
    } catch {
        return false;
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof ZodError) return error.issues[0]?.message ?? "Invalid message";
    if (error instanceof ChatError) return error.message;
    return "Could not complete the answer. Please retry.";
}

async function readInput(request: Request): Promise<unknown> {
    if (!request.body) throw new SyntaxError("Empty request");
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > MAX_REQUEST_BYTES) {
                await reader.cancel();
                throw new RequestBodyTooLargeError();
            }
            body += decoder.decode(next.value, { stream: true });
        }
        body += decoder.decode();
        return JSON.parse(body) as unknown;
    } finally {
        reader.releaseLock();
    }
}

export async function POST(request: Request): Promise<Response> {
    if (!isSameOrigin(request)) return new Response(null, { status: 403 });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
    const user = await getCurrentUser();
    if (!user) return new Response(null, { status: 401 });

    let input: unknown;
    try {
        input = await readInput(request);
    } catch (error: unknown) {
        if (error instanceof RequestBodyTooLargeError) return Response.json({ errorMessage: "Message is too large" }, { status: 413 });
        return Response.json({ errorMessage: "Invalid message" }, { status: 400 });
    }
    const encoder = new TextEncoder();
    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), { once: true });
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            function send(event: ChatStreamEvent): void {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                    closed = true;
                    abort.abort();
                }
            }
            void chatService.sendMessage(user.id, input, { onEvent: send, signal: abort.signal })
                .catch((error: unknown) => send({ type: "error", message: errorMessage(error) }))
                .finally(() => {
                    if (closed) return;
                    closed = true;
                    controller.close();
                });
        },
        cancel() {
            closed = true;
            abort.abort();
        },
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}
