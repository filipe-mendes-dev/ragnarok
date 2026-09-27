import { afterEach, describe, expect, it, vi } from "vitest";
import { embedQuery } from "@/server/embedding/query-embedder";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_REVISION, RetrievalError } from "@/server/modules/retrieval/retrieval-contract";
import { EMBEDDING_RESPONSE_MODEL } from "@/server/embedding/embedding-config";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("embedQuery", () => {
    it("sends the configured model and dimensions to OpenRouter", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        const vector = [1, ...Array<number>(EMBEDDING_DIMENSIONS - 1).fill(0)];
        const fetcher = vi.fn().mockResolvedValue(Response.json({ model: EMBEDDING_RESPONSE_MODEL, data: [{ index: 0, embedding: vector }] }));
        vi.stubGlobal("fetch", fetcher);

        await expect(embedQuery("question")).resolves.toEqual({ vector, model: EMBEDDING_MODEL, revision: EMBEDDING_REVISION });
        const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://openrouter.ai/api/v1/embeddings");
        expect(options.headers).toMatchObject({ Authorization: "Bearer private-key" });
        expect(JSON.parse(String(options.body)) as unknown).toEqual({
            model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input: "question", encoding_format: "float",
        });
    });

    it("rejects incompatible or malformed vectors at the provider boundary", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        for (const embedding of [[0, 1], Array<number>(EMBEDDING_DIMENSIONS).fill(0), []]) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ model: EMBEDDING_MODEL, data: [{ index: 0, embedding }] })));
            await expect(embedQuery("question")).rejects.toEqual(new RetrievalError("unavailable"));
        }
    });

    it("maps input rejection to a useful error without exposing the provider body", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "private-key");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status: 413 })));
        await expect(embedQuery("long question")).rejects.toEqual(new RetrievalError("invalid_query"));
    });

    it("does not call the provider without an API key", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "");
        const fetcher = vi.fn();
        vi.stubGlobal("fetch", fetcher);
        await expect(embedQuery("question")).rejects.toEqual(new RetrievalError("unavailable"));
        expect(fetcher).not.toHaveBeenCalled();
    });
});
