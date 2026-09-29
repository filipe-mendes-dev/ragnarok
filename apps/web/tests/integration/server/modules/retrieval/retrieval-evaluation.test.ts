import { afterAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_REVISION } from "@/server/modules/retrieval/retrieval-contract";
import { EMBEDDING_RESPONSE_MODEL } from "@/server/embedding/embedding-config";
import { evaluationDocuments, evaluationQuestions } from "../../../../evaluation/retrieval-corpus";
import { createTextDocumentFixture } from "../../../../fixtures/documents";
import { createChunkFixture } from "../../../../fixtures/retrieval";
import { createIntegrationDatabase } from "../../../support/database";
import { createUserSeeder } from "../../../support/seeders/users";
import { seedDocument } from "../../../support/seeders/documents";
import { createChunkSeeder } from "../../../support/seeders/chunks";

const { database, databasePool } = createIntegrationDatabase();
const users = createUserSeeder(database);
const chunks = createChunkSeeder(database);
afterAll(async () => { await databasePool.end(); });

describe("retrieval ranking benchmark v1", () => {
    it.skipIf(process.env.RUN_LIVE_EMBEDDING_EVALUATION !== "1")("reports source retrieval on a fixed synthetic corpus using OpenRouter", async () => {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error("Set OPENROUTER_API_KEY for the live retrieval evaluation");
        try {
            const owner = await users.seed();
            const configId = await chunks.seedConfig();
            const sourceKeys = new Map<string, string>();
            for (const source of evaluationDocuments) {
                const fixture = createTextDocumentFixture({ userId: owner.id, status: "completed", title: source.title, sourceText: source.passages.join("\n\n") });
                await seedDocument(database, fixture);
                sourceKeys.set(fixture.id, source.key);
                const response = await fetch("https://openrouter.ai/api/v1/embeddings", { method: "POST", headers: {
                    Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
                }, body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS,
                    input: source.passages, encoding_format: "float" }), signal: AbortSignal.timeout(30_000) });
                expect(response.ok).toBe(true);
                const body = z.object({ model: z.union([z.literal(EMBEDDING_MODEL), z.literal(EMBEDDING_RESPONSE_MODEL)]), data: z.array(z.object({
                    index: z.number().int(), embedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS),
                })).length(source.passages.length) }).parse(await response.json());
                for (const [ordinal, text] of source.passages.entries()) {
                    const embedding = body.data.find((item) => item.index === ordinal)?.embedding;
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
            const report = { benchmark: "synthetic-ranking-v1", model: EMBEDDING_MODEL, configuration: EMBEDDING_REVISION,
                sourceRecallAt5: answerable.reduce((sum, row) => sum + (row.sourceRecallAt5 ?? 0), 0) / answerable.length,
                meanReciprocalRank: answerable.reduce((sum, row) => sum + row.reciprocalRank, 0) / answerable.length, results };
            console.info(JSON.stringify(report, null, 2));
            if (process.env.RETRIEVAL_EVALUATION_REPORT) await writeFile(process.env.RETRIEVAL_EVALUATION_REPORT, JSON.stringify(report, null, 2) + "\n");
            expect(results).toHaveLength(evaluationQuestions.length);
            expect(answerable.some((row) => (row.sourceRecallAt5 ?? 0) > 0)).toBe(true);
        } finally {
            await users.cleanup();
            await chunks.cleanup();
        }
    }, 120_000);
});
