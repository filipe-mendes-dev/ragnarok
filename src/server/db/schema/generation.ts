import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { retrievalRun } from "./retrieval";

export const generationStatus = pgEnum("generation_status", ["started", "completed", "failed"]);

export const generationRun = pgTable("generation_run", {
    retrievalRunId: uuid("retrieval_run_id").primaryKey().references(() => retrievalRun.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id").notNull(),
    status: generationStatus("status").notNull(),
    promptVersion: text("prompt_version").notNull(),
    selectedChunkIds: jsonb("selected_chunk_ids").$type<string[]>().notNull().default([]),
    provider: text("provider"),
    requestedModel: text("requested_model"),
    responseModel: text("response_model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
    check("generation_run_input_tokens_nonnegative", sql`${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0`),
    check("generation_run_output_tokens_nonnegative", sql`${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0`),
    check("generation_run_total_tokens_nonnegative", sql`${table.totalTokens} IS NULL OR ${table.totalTokens} >= 0`),
    check("generation_run_latency_nonnegative", sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`),
]);
