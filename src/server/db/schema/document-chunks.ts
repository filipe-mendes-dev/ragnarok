import { relations, sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { document } from "@/server/db/schema/documents";
import { chunkConfig } from "@/server/db/schema/chunk-configs";

export const documentChunk = pgTable(
    "document_chunk",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        documentId: uuid("document_id")
            .notNull()
            .references(() => document.id, { onDelete: "cascade" }),
        revision: integer("revision").notNull(),
        ordinal: integer("ordinal").notNull(),
        text: text("text").notNull(),
        pageNumber: integer("page_number"),
        chunkConfigId: uuid("chunk_config_id")
            .notNull()
            .references(() => chunkConfig.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        uniqueIndex("document_chunk_document_revision_ordinal_idx").on(
            table.documentId,
            table.revision,
            table.ordinal,
        ),
        check("document_chunk_revision_positive", sql`${table.revision} > 0`),
        check("document_chunk_ordinal_nonnegative", sql`${table.ordinal} >= 0`),
        check("document_chunk_text_not_blank", sql`${table.text} ~ '[^[:space:]]'`),
        check("document_chunk_page_number_positive", sql`${table.pageNumber} > 0`),
    ],
);

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
    document: one(document, {
        fields: [documentChunk.documentId],
        references: [document.id],
    }),
    config: one(chunkConfig, {
        fields: [documentChunk.chunkConfigId],
        references: [chunkConfig.id],
    }),
}));

export type DocumentChunkRow = typeof documentChunk.$inferSelect;
export type NewDocumentChunkRow = typeof documentChunk.$inferInsert;
