import { createServer } from "node:http";
import { z } from "zod";

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/server/modules/retrieval/retrieval-contract";
import { EMBEDDING_RESPONSE_MODEL } from "@/server/embedding/embedding-config";

const requestSchema = z.object({
    model: z.literal(EMBEDDING_MODEL),
    dimensions: z.literal(EMBEDDING_DIMENSIONS),
    input: z.union([z.string(), z.array(z.string()).min(1)]),
    encoding_format: z.literal("float"),
});

export interface TestOpenRouterEmbeddings {
    url: string;
    stop(): Promise<void>;
}

export async function startOpenRouterEmbeddingsStub(): Promise<TestOpenRouterEmbeddings> {
    const server = createServer(async (request, response) => {
        if (request.method !== "POST" || request.url !== "/embeddings" || request.headers.authorization !== "Bearer test-openrouter-key") {
            response.writeHead(401).end();
            return;
        }
        try {
            const parts: Buffer[] = [];
            for await (const part of request) parts.push(Buffer.from(part));
            const parsed = requestSchema.parse(JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown);
            const texts = typeof parsed.input === "string" ? [parsed.input] : parsed.input;
            const data = texts.map((text, index) => {
                const embedding = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
                const secondary = Math.min(text.length, 1000) / 1000;
                const norm = Math.hypot(1, secondary);
                embedding[0] = 1 / norm;
                embedding[1] = secondary / norm;
                return { index, embedding };
            });
            response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ model: EMBEDDING_RESPONSE_MODEL, data }));
        } catch {
            response.writeHead(400).end();
        }
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No embedding stub port allocated");
    return {
        url: `http://127.0.0.1:${address.port}/embeddings`,
        async stop() {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        },
    };
}
