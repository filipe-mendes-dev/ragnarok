ALTER TABLE "document_chunk" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "document_chunk" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD COLUMN "embedding_revision" text;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_embedding_complete" CHECK (
            ("document_chunk"."embedding" IS NULL AND "document_chunk"."embedding_model" IS NULL AND "document_chunk"."embedding_revision" IS NULL)
            OR ("document_chunk"."embedding" IS NOT NULL AND "document_chunk"."embedding_model" IS NOT NULL AND "document_chunk"."embedding_revision" IS NOT NULL
                AND "document_chunk"."embedding_model" ~ '[^[:space:]]' AND "document_chunk"."embedding_revision" ~ '[^[:space:]]')
        );