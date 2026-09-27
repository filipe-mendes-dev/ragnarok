ALTER TABLE "document_chunk" DROP CONSTRAINT "document_chunk_embedding_complete";--> statement-breakpoint
ALTER TABLE "document_chunk" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "document_chunk" DROP COLUMN "embedding_model";--> statement-breakpoint
ALTER TABLE "document_chunk" DROP COLUMN "embedding_revision";