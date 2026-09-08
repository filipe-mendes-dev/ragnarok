CREATE TYPE "public"."document_source_type" AS ENUM('text', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"source_type" "document_source_type" NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"source_text" text,
	"storage_key" text,
	"original_filename" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"processing_error" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_title_not_blank" CHECK (length(btrim("document"."title")) > 0),
	CONSTRAINT "document_size_bytes_positive" CHECK ("document"."size_bytes" > 0),
	CONSTRAINT "document_revision_positive" CHECK ("document"."revision" > 0),
	CONSTRAINT "document_source_payload_valid" CHECK ((
                "document"."source_type" = 'text'
                AND "document"."source_text" IS NOT NULL
                AND length(btrim("document"."source_text")) > 0
                AND "document"."storage_key" IS NULL
                AND "document"."original_filename" IS NULL
                AND "document"."mime_type" = 'text/plain'
            ) OR (
                "document"."source_type" = 'pdf'
                AND "document"."source_text" IS NULL
                AND "document"."storage_key" IS NOT NULL
                AND length(btrim("document"."storage_key")) > 0
                AND "document"."original_filename" IS NOT NULL
                AND length(btrim("document"."original_filename")) > 0
                AND "document"."mime_type" = 'application/pdf'
            ))
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_user_id_created_at_idx" ON "document" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_storage_key_idx" ON "document" USING btree ("storage_key");