import { afterEach, describe, expect, it, vi } from "vitest";
import { embedQuery } from "@/server/embedding/query-embedder";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, RetrievalError } from "@/server/modules/retrieval/retrieval-contract";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("embedQuery", () => {
    it("rejects incompatible or malformed vectors at the HTTP boundary", async () => {
        vi.stubEnv("EMBEDDING_SERVICE_URL", "http://localhost:8081");
        for (const vectors of [[[0, 1]], [Array<number>(384).fill(0)], []]) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ model: EMBEDDING_MODEL, revision: EMBEDDING_REVISION, vectors })));
            await expect(embedQuery("question")).rejects.toEqual(new RetrievalError("unavailable"));
        }
    });
    it("maps token rejection to a useful error without exposing the upstream body", async () => {
        vi.stubEnv("EMBEDDING_SERVICE_URL", "http://localhost:8081");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status: 422 })));
        await expect(embedQuery("long question")).rejects.toEqual(new RetrievalError("invalid_query"));
    });
});
