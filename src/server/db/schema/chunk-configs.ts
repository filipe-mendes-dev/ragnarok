import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const chunkConfig = pgTable(
    "chunk_config",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        chunkingMethod: text("chunking_method").notNull(),
        chunkSize: integer("chunk_size").notNull(),
        chunkOverlap: integer("chunk_overlap").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        uniqueIndex("chunk_config_method_size_overlap_idx").on(
            table.chunkingMethod,
            table.chunkSize,
            table.chunkOverlap,
        ),
        check("chunk_config_method_not_blank", sql`${table.chunkingMethod} ~ '[^[:space:]]'`),
        check("chunk_config_size_positive", sql`${table.chunkSize} > 0`),
        check(
            "chunk_config_overlap_valid",
            sql`${table.chunkOverlap} >= 0 AND ${table.chunkOverlap} < ${table.chunkSize}`,
        ),
    ],
);

export type ChunkConfigRow = typeof chunkConfig.$inferSelect;
export type NewChunkConfigRow = typeof chunkConfig.$inferInsert;
