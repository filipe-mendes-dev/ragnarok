CREATE TYPE "public"."generation_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "generation_run" (
	"retrieval_run_id" uuid PRIMARY KEY NOT NULL,
	"execution_id" uuid NOT NULL,
	"status" "generation_status" NOT NULL,
	"prompt_version" text NOT NULL,
	"selected_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"requested_model" text,
	"response_model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_run_input_tokens_nonnegative" CHECK ("generation_run"."input_tokens" IS NULL OR "generation_run"."input_tokens" >= 0),
	CONSTRAINT "generation_run_output_tokens_nonnegative" CHECK ("generation_run"."output_tokens" IS NULL OR "generation_run"."output_tokens" >= 0),
	CONSTRAINT "generation_run_total_tokens_nonnegative" CHECK ("generation_run"."total_tokens" IS NULL OR "generation_run"."total_tokens" >= 0),
	CONSTRAINT "generation_run_latency_nonnegative" CHECK ("generation_run"."latency_ms" IS NULL OR "generation_run"."latency_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_retrieval_run_id_retrieval_run_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_run"("id") ON DELETE cascade ON UPDATE no action;