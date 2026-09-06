import { relations, sql } from "drizzle-orm";
import {
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/server/db/auth-schema";
import {
    DOCUMENT_SOURCE_TYPES,
    DOCUMENT_STATUSES,
} from "@/server/documents/document-source";

export const documentSourceType = pgEnum(
    "document_source_type",
    DOCUMENT_SOURCE_TYPES,
);

export const documentStatus = pgEnum("document_status", DOCUMENT_STATUSES);

export const document = pgTable(
    "document",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        sourceType: documentSourceType("source_type").notNull(),
        status: documentStatus("status").default("uploaded").notNull(),
        sourceText: text("source_text"),
        storageKey: text("storage_key"),
        originalFilename: text("original_filename"),
        mimeType: text("mime_type").notNull(),
        sizeBytes: integer("size_bytes").notNull(),
        processingError: text("processing_error"),
        revision: integer("revision").default(1).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("document_user_id_created_at_idx").on(
            table.userId,
            table.createdAt,
        ),
        uniqueIndex("document_storage_key_idx").on(table.storageKey),
        check("document_title_not_blank", sql`length(btrim(${table.title})) > 0`),
        check("document_size_bytes_positive", sql`${table.sizeBytes} > 0`),
        check("document_revision_positive", sql`${table.revision} > 0`),
        check(
            "document_source_payload_valid",
            sql`(
                ${table.sourceType} = 'text'
                AND ${table.sourceText} IS NOT NULL
                AND length(btrim(${table.sourceText})) > 0
                AND ${table.storageKey} IS NULL
                AND ${table.originalFilename} IS NULL
                AND ${table.mimeType} = 'text/plain'
            ) OR (
                ${table.sourceType} = 'pdf'
                AND ${table.sourceText} IS NULL
                AND ${table.storageKey} IS NOT NULL
                AND length(btrim(${table.storageKey})) > 0
                AND ${table.originalFilename} IS NOT NULL
                AND length(btrim(${table.originalFilename})) > 0
                AND ${table.mimeType} = 'application/pdf'
            )`,
        ),
    ],
);

export const documentRelations = relations(document, ({ one }) => ({
    user: one(user, {
        fields: [document.userId],
        references: [user.id],
    }),
}));

export type DocumentRow = typeof document.$inferSelect;
export type NewDocumentRow = typeof document.$inferInsert;
