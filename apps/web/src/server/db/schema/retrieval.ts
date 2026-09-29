import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { message } from "./conversations";
import { document } from "./documents";
import type { DocumentScope, RetrievalTimings } from "@/shared/retrieval";

export const retrievalStatus = pgEnum("retrieval_status", ["started", "completed", "failed"]);

export const retrievalRun = pgTable("retrieval_run", {
    id: uuid("id").primaryKey(),
    messageId: uuid("message_id").notNull().references(() => message.id, { onDelete: "cascade" }),
    responseMessageId: uuid("response_message_id").notNull().references(() => message.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id").notNull(),
    status: retrievalStatus("status").notNull(),
    query: text("query").notNull(),
    scope: jsonb("scope").$type<DocumentScope>().notNull(),
    limit: integer("result_limit").notNull(),
    model: text("model").notNull(),
    modelRevision: text("model_revision").notNull(),
    timings: jsonb("timings").$type<RetrievalTimings>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
    uniqueIndex("retrieval_run_message_idx").on(table.messageId),
    uniqueIndex("retrieval_run_response_message_idx").on(table.responseMessageId),
    check("retrieval_run_positive_limit", sql`${table.limit} > 0`),
]);

export const retrievalCandidate = pgTable("retrieval_candidate", {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => retrievalRun.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => document.id, { onDelete: "cascade" }),
    // Keep the evidence snapshot when re-ingestion replaces the original chunk.
    chunkId: uuid("chunk_id").notNull(),
    documentTitle: text("document_title").notNull(),
    revision: integer("revision").notNull(),
    ordinal: integer("ordinal").notNull(),
    pageNumber: integer("page_number"),
    text: text("text").notNull(),
    rank: integer("rank").notNull(),
    semanticSimilarity: doublePrecision("semantic_similarity").notNull(),
}, (table) => [
    uniqueIndex("retrieval_candidate_rank_idx").on(table.runId, table.rank),
    index("retrieval_candidate_document_idx").on(table.documentId),
    check("retrieval_candidate_positive_rank", sql`${table.rank} > 0`),
]);
