import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { chunkConfig } from "@/server/db/schema/chunk-configs";
import { documentChunk, type NewDocumentChunkRow } from "@/server/db/schema/document-chunks";

export function createChunkSeeder(db: Database) {
    const configs: string[] = [];
    async function seedConfig(): Promise<string> {
        const id = randomUUID();
        await db.insert(chunkConfig).values({ id, chunkingMethod: `test-${id}`, chunkSize: 384, chunkOverlap: 48 });
        configs.push(id);
        return id;
    }
    async function seed(input: NewDocumentChunkRow): Promise<void> {
        await db.insert(documentChunk).values(input);
    }
    async function cleanup(): Promise<void> {
        if (configs.length === 0) return;
        await db.delete(documentChunk).where(inArray(documentChunk.chunkConfigId, configs));
        for (const id of configs) await db.delete(chunkConfig).where(eq(chunkConfig.id, id));
        configs.length = 0;
    }
    return { seedConfig, seed, cleanup };
}
