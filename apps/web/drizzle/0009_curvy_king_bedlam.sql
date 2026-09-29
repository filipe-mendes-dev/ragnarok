ALTER TABLE "generation_run" ADD COLUMN "provider_response_id" text;--> statement-breakpoint
ALTER TABLE "generation_run" ADD COLUMN "finish_reason" text;--> statement-breakpoint
ALTER TABLE "generation_run" ADD COLUMN "http_status" integer;--> statement-breakpoint
ALTER TABLE "generation_run" ADD COLUMN "reasoning_tokens" integer;--> statement-breakpoint
ALTER TABLE "generation_run" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_reasoning_tokens_nonnegative" CHECK ("generation_run"."reasoning_tokens" IS NULL OR "generation_run"."reasoning_tokens" >= 0);--> statement-breakpoint
ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_http_status_valid" CHECK ("generation_run"."http_status" IS NULL OR "generation_run"."http_status" BETWEEN 100 AND 599);