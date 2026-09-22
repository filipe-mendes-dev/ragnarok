import { afterAll, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";
import { EMBEDDING_MODEL, EMBEDDING_REVISION } from "@/server/modules/retrieval/retrieval-contract";
import { evaluationDocuments, evaluationQuestions } from "../../../../evaluation/retrieval-corpus";
import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createChunkFixture } from "../../../../fixtures/retrieval";
import { createIntegrationDatabase } from "../../../support/database";
import { createUserSeeder } from "../../../support/seeders/users";
import { seedDocument } from "../../../support/seeders/documents";
import { createChunkSeeder } from "../../../support/seeders/chunks";
import { startEmbeddingServer } from "../../../support/embedding-server";

const { database, databasePool } = createIntegrationDatabase();
const users = createUserSeeder(database);
const chunks = createChunkSeeder(database);
afterAll(async () => { await databasePool.end(); });

describe("retrieval ranking benchmark v1", () => {
    it("reports source retrieval on a fixed synthetic corpus using the actual BGE model", async () => {
        const server = await startEmbeddingServer();
        vi.stubEnv("EMBEDDING_SERVICE_URL", server.url);
        try {
            const owner = await users.seed();
            const configId = await chunks.seedConfig();
            const sourceKeys = new Map<string, string>();
            for (const source of evaluationDocuments) {
                const fixture = createTextDocumentFixture({ userId: owner.id, status: "completed", title: source.title, sourceText: source.passages.join("\n\n") });
                await seedDocument(database, fixture);
                sourceKeys.set(fixture.id, source.key);
                const response = await fetch(`${server.url}/embed`, { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind: "document", texts: source.passages }), signal: AbortSignal.timeout(20_000) });
                expect(response.ok).toBe(true);
                const body = z.object({ model: z.literal(EMBEDDING_MODEL), revision: z.literal(EMBEDDING_REVISION),
                    vectors: z.array(z.array(z.number()).length(384)).length(source.passages.length) }).parse(await response.json());
                for (const [ordinal, text] of source.passages.entries()) {
                    const embedding = body.vectors[ordinal];
                    if (!embedding) throw new Error("Missing benchmark vector");
                    await chunks.seed(createChunkFixture(fixture.id, configId, { ordinal, text, embedding }));
                }
            }
            const service = createRetrievalService(database);
            const results = [];
            for (const entry of evaluationQuestions) {
                const result = await service.retrieve(owner.id, { query: entry.question });
                const rankedSources = result.chunks.map((chunk) => sourceKeys.get(chunk.documentId));
                const found = entry.expectedSources.filter((key) => rankedSources.includes(key));
                const firstRelevant = rankedSources.findIndex((key) => key !== undefined && entry.expectedSources.includes(key));
                results.push({ question: entry.question, sourceRecallAt5: entry.expectedSources.length ? found.length / entry.expectedSources.length : null,
                    reciprocalRank: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1), totalMs: result.timings.totalMs,
                    retrievedSources: rankedSources });
            }
            const answerable = results.filter((row) => row.sourceRecallAt5 !== null);
            const report = { benchmark: "synthetic-ranking-v1", model: EMBEDDING_REVISION,
                sourceRecallAt5: answerable.reduce((sum, row) => sum + (row.sourceRecallAt5 ?? 0), 0) / answerable.length,
                meanReciprocalRank: answerable.reduce((sum, row) => sum + row.reciprocalRank, 0) / answerable.length, results };
            console.info(JSON.stringify(report, null, 2));
            if (process.env.RETRIEVAL_EVALUATION_REPORT) await writeFile(process.env.RETRIEVAL_EVALUATION_REPORT, JSON.stringify(report, null, 2) + "\n");
            expect(results).toHaveLength(evaluationQuestions.length);
            expect(answerable.some((row) => (row.sourceRecallAt5 ?? 0) > 0)).toBe(true);
        } finally {
            vi.unstubAllEnvs();
            await users.cleanup();
            await chunks.cleanup();
            await server.stop();
        }
    }, 60_000);
});
