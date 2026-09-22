CREATE TYPE "public"."retrieval_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "retrieval_candidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"document_title" text NOT NULL,
	"revision" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"page_number" integer,
	"text" text NOT NULL,
	"rank" integer NOT NULL,
	"semantic_similarity" double precision NOT NULL,
	CONSTRAINT "retrieval_candidate_positive_rank" CHECK ("retrieval_candidate"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "retrieval_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"response_message_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"status" "retrieval_status" NOT NULL,
	"query" text NOT NULL,
	"scope" jsonb NOT NULL,
	"result_limit" integer NOT NULL,
	"model" text NOT NULL,
	"model_revision" text NOT NULL,
	"timings" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "retrieval_run_positive_limit" CHECK ("retrieval_run"."result_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "retrieval_candidate" ADD CONSTRAINT "retrieval_candidate_run_id_retrieval_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."retrieval_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_candidate" ADD CONSTRAINT "retrieval_candidate_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_run" ADD CONSTRAINT "retrieval_run_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_run" ADD CONSTRAINT "retrieval_run_response_message_id_message_id_fk" FOREIGN KEY ("response_message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_candidate_rank_idx" ON "retrieval_candidate" USING btree ("run_id","rank");--> statement-breakpoint
CREATE INDEX "retrieval_candidate_document_idx" ON "retrieval_candidate" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_run_message_idx" ON "retrieval_run" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_run_response_message_idx" ON "retrieval_run" USING btree ("response_message_id");