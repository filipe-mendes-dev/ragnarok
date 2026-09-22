import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, RetrievalError, type QueryEmbedding } from "@/server/modules/retrieval/retrieval-contract";
import { document } from "@/server/db/schema/documents";
import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createChunkFixture } from "../../../../fixtures/retrieval";
import { createIntegrationDatabase } from "../../../support/database";
import { createUserSeeder } from "../../../support/seeders/users";
import { seedDocument } from "../../../support/seeders/documents";
import { createChunkSeeder } from "../../../support/seeders/chunks";

const { database, databasePool } = createIntegrationDatabase();
const users = createUserSeeder(database);
const chunks = createChunkSeeder(database);
async function embedQueryFixture(): Promise<QueryEmbedding> {
    return { vector: [1, ...Array<number>(383).fill(0)], model: EMBEDDING_MODEL, revision: EMBEDDING_REVISION };
}
const service = createRetrievalService(database, embedQueryFixture);
afterEach(async () => { await users.cleanup(); await chunks.cleanup(); });
afterAll(async () => { await databasePool.end(); });

describe("retrievalService.retrieve", () => {
    it("ranks only owned, completed, current, compatible chunks even when excluded chunks are closer", async () => {
        const owner = await users.seed();
        const other = await users.seed();
        const config = await chunks.seedConfig();
        const eligible = createTextDocumentFixture({ userId: owner.id, status: "completed" });
        await seedDocument(database, eligible);
        const expected = createChunkFixture(eligible.id, config, { embedding: [0.8, 0.6, ...Array<number>(382).fill(0)] });
        await chunks.seed(expected);
        for (const state of ["foreign", "processing", "failed", "stale", "model", "revision", "null"] as const) {
            const source = createTextDocumentFixture({ userId: state === "foreign" ? other.id : owner.id,
                status: state === "processing" || state === "failed" ? state : "completed" });
            await seedDocument(database, source);
            if (state === "stale") await database.update(document).set({ revision: 2 }).where(eq(document.id, source.id));
            await chunks.seed(createChunkFixture(source.id, config, {
                ...(state === "model" ? { embeddingModel: "other" } : {}),
                ...(state === "revision" ? { embeddingRevision: "other" } : {}),
                ...(state === "null" ? { embedding: null, embeddingModel: null, embeddingRevision: null } : {}),
            }));
        }
        const result = await service.retrieve(owner.id, { query: "cancellation" });
        expect(result.chunks).toHaveLength(1);
        expect(result.chunks[0]).toMatchObject({ chunkId: expected.id, text: expected.text, revision: 1, rank: 1 });
        expect(result.chunks[0]?.semanticSimilarity).toBeCloseTo(0.8);
    });

    it("returns five nearest chunks with deterministic ranks", async () => {
        const owner = await users.seed();
        const config = await chunks.seedConfig();
        const source = createTextDocumentFixture({ userId: owner.id, status: "completed" });
        await seedDocument(database, source);
        const expectedIds: string[] = [];
        for (let ordinal = 0; ordinal < 7; ordinal++) {
            const id = randomUUID(); expectedIds.push(id);
            await chunks.seed(createChunkFixture(source.id, config, { id, ordinal, embedding: [1, ordinal, ...Array<number>(382).fill(0)] }));
        }
        const result = await service.retrieve(owner.id, { query: "question" });
        expect(result.chunks.map((row) => row.chunkId)).toEqual(expectedIds.slice(0, 5));
        expect(result.chunks.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    });

    it("restricts explicit scope and never broadens an unavailable selection", async () => {
        const owner = await users.seed();
        const config = await chunks.seedConfig();
        const source = createTextDocumentFixture({ userId: owner.id, status: "completed" });
        await seedDocument(database, source);
        await chunks.seed(createChunkFixture(source.id, config));
        const result = await service.retrieve(owner.id, { query: "question", scope: { mode: "selected", documentIds: [source.id] } });
        expect(result.chunks.map((row) => row.documentId)).toEqual([source.id]);
        await expect(service.retrieve(owner.id, { query: "question", scope: { mode: "selected", documentIds: [source.id, randomUUID()] } })).rejects.toEqual(new RetrievalError("invalid_scope"));
    });

    it("returns an empty successful result when there are no eligible documents", async () => {
        const owner = await users.seed();
        expect(await service.retrieve(owner.id, { query: "question" })).toMatchObject({ chunks: [], query: "question" });
    });
});
