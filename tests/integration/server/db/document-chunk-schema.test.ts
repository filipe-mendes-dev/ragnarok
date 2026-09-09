import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { documentChunk, type NewDocumentChunkRow } from "@/server/db/schema/document-chunks";
import { chunkConfig, type NewChunkConfigRow } from "@/server/db/schema/chunk-configs";
import { document } from "@/server/db/schema/documents";

import { createTextDocumentFixture } from "../../../fixtures/documents";
import { createIntegrationDatabase } from "../../support/database";
import { seedDocument } from "../../support/seeders/documents";
import { createUserSeeder } from "../../support/seeders/users";

const { database, databasePool } = createIntegrationDatabase();
const userSeeder = createUserSeeder(database);
let configId: string;

function createConfigInput(): NewChunkConfigRow {
    return {
        chunkingMethod: "recursive-character-v1",
        chunkSize: 1_000,
        chunkOverlap: 150,
    };
}

function createChunkInput(documentId: string, chunkConfigId: string): NewDocumentChunkRow {
    return {
        documentId,
        revision: 1,
        ordinal: 0,
        text: "A useful passage.",
        pageNumber: null,
        chunkConfigId,
    };
}

async function seedOwnedDocument(): Promise<string> {
    const owner = await userSeeder.seed({ name: "Chunk owner" });
    const fixture = createTextDocumentFixture({ userId: owner.id });
    await seedDocument(database, fixture);
    return fixture.id;
}

interface InvalidChunkCase {
    description: string;
    changes: Partial<NewDocumentChunkRow>;
    constraint: string;
}

const invalidCases: InvalidChunkCase[] = [
    { description: "nonpositive revision", changes: { revision: 0 }, constraint: "document_chunk_revision_positive" },
    { description: "negative ordinal", changes: { ordinal: -1 }, constraint: "document_chunk_ordinal_nonnegative" },
    { description: "whitespace-only text", changes: { text: " \t\n" }, constraint: "document_chunk_text_not_blank" },
    { description: "nonpositive page", changes: { pageNumber: 0 }, constraint: "document_chunk_page_number_positive" },
];

describe("document chunk constraints", () => {
    beforeEach(async () => {
        configId = randomUUID();
        await database.insert(chunkConfig).values({ ...createConfigInput(), id: configId });
    });

    afterEach(async () => {
        await userSeeder.cleanup();
        await database.delete(chunkConfig).where(eq(chunkConfig.id, configId));
    });

    afterAll(async () => {
        await databasePool.end();
    });

    it("persists chunk text and its configuration reference without requiring a page", async () => {
        const input = createChunkInput(await seedOwnedDocument(), configId);
        await database.insert(documentChunk).values(input);

        const rows = await database.select().from(documentChunk)
            .where(eq(documentChunk.documentId, input.documentId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject(input);
    });

    it("rejects a duplicate position within the same document revision", async () => {
        const input = createChunkInput(await seedOwnedDocument(), configId);
        await database.insert(documentChunk).values(input);

        await expect(database.insert(documentChunk).values(input)).rejects.toMatchObject({
            cause: { code: "23505", constraint: "document_chunk_document_revision_ordinal_idx" },
        });
    });

    it("keeps old chunks when the document revision advances", async () => {
        const documentId = await seedOwnedDocument();
        const input = createChunkInput(documentId, configId);
        await database.insert(documentChunk).values(input);

        await database.update(document).set({ revision: 2 }).where(eq(document.id, documentId));
        await database.insert(documentChunk).values({ ...input, revision: 2 });

        const rows = await database.select({ revision: documentChunk.revision })
            .from(documentChunk).where(eq(documentChunk.documentId, documentId))
            .orderBy(documentChunk.revision);
        expect(rows).toEqual([{ revision: 1 }, { revision: 2 }]);
    });

    it("deletes dependent chunks when their document is deleted", async () => {
        const documentId = await seedOwnedDocument();
        await database.insert(documentChunk).values(createChunkInput(documentId, configId));

        await database.delete(document).where(eq(document.id, documentId));

        expect(await database.select().from(documentChunk)
            .where(eq(documentChunk.documentId, documentId))).toEqual([]);
    });

    it("rejects a chunk without an existing document", async () => {
        await expect(database.insert(documentChunk).values(createChunkInput(randomUUID(), configId)))
            .rejects.toMatchObject({ cause: { code: "23503", constraint: "document_chunk_document_id_document_id_fk" } });
    });

    it("rejects an unknown configuration reference", async () => {
        const input = createChunkInput(await seedOwnedDocument(), configId);
        await expect(database.insert(documentChunk).values({ ...input, chunkConfigId: randomUUID() }))
            .rejects.toMatchObject({ cause: { code: "23503", constraint: "document_chunk_chunk_config_id_chunk_config_id_fk" } });
    });

    it("reuses one configuration across documents", async () => {
        const first = createChunkInput(await seedOwnedDocument(), configId);
        const second = createChunkInput(await seedOwnedDocument(), configId);
        await database.insert(documentChunk).values([first, second]);
        const rows = await database.select({ documentId: documentChunk.documentId, configId: documentChunk.chunkConfigId })
            .from(documentChunk).where(eq(documentChunk.chunkConfigId, configId));
        expect(rows).toHaveLength(2);
        expect(rows).toEqual(expect.arrayContaining([
            { documentId: first.documentId, configId },
            { documentId: second.documentId, configId },
        ]));
    });

    it("prevents deleting a configuration referenced by a chunk", async () => {
        await database.insert(documentChunk).values(createChunkInput(await seedOwnedDocument(), configId));
        await expect(database.delete(chunkConfig).where(eq(chunkConfig.id, configId)))
            .rejects.toMatchObject({ cause: { code: "23503", constraint: "document_chunk_chunk_config_id_chunk_config_id_fk" } });
    });

    it("rejects duplicate configuration settings", async () => {
        await expect(database.insert(chunkConfig).values(createConfigInput()))
            .rejects.toMatchObject({ cause: { code: "23505", constraint: "chunk_config_method_size_overlap_idx" } });
    });

    it.each([
        { changes: { chunkingMethod: " " }, constraint: "chunk_config_method_not_blank" },
        { changes: { chunkOverlap: -1 }, constraint: "chunk_config_overlap_valid" },
        { changes: { chunkOverlap: 1_000 }, constraint: "chunk_config_overlap_valid" },
    ])("rejects invalid settings: $constraint", async ({ changes, constraint }) => {
        await expect(database.insert(chunkConfig).values({ ...createConfigInput(), ...changes }))
            .rejects.toMatchObject({ cause: { code: "23514", constraint } });
    });

    it.each(invalidCases)("rejects $description", async ({ changes, constraint }) => {
        const input = createChunkInput(await seedOwnedDocument(), configId);
        await expect(database.insert(documentChunk).values({ ...input, ...changes }))
            .rejects.toMatchObject({ cause: { code: "23514", constraint } });
    });
});
