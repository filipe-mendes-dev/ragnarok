CREATE TABLE "document_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"page_number" integer,
	"chunk_config_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunk_revision_positive" CHECK ("document_chunk"."revision" > 0),
	CONSTRAINT "document_chunk_ordinal_nonnegative" CHECK ("document_chunk"."ordinal" >= 0),
	CONSTRAINT "document_chunk_text_not_blank" CHECK ("document_chunk"."text" ~ '[^[:space:]]'),
	CONSTRAINT "document_chunk_page_number_positive" CHECK ("document_chunk"."page_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "chunk_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunking_method" text NOT NULL,
	"chunk_size" integer NOT NULL,
	"chunk_overlap" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_config_method_not_blank" CHECK ("chunk_config"."chunking_method" ~ '[^[:space:]]'),
	CONSTRAINT "chunk_config_size_positive" CHECK ("chunk_config"."chunk_size" > 0),
	CONSTRAINT "chunk_config_overlap_valid" CHECK ("chunk_config"."chunk_overlap" >= 0 AND "chunk_config"."chunk_overlap" < "chunk_config"."chunk_size")
);
--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_chunk_config_id_chunk_config_id_fk" FOREIGN KEY ("chunk_config_id") REFERENCES "public"."chunk_config"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunk_document_revision_ordinal_idx" ON "document_chunk" USING btree ("document_id","revision","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "chunk_config_method_size_overlap_idx" ON "chunk_config" USING btree ("chunking_method","chunk_size","chunk_overlap");