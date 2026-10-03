CREATE TYPE "public"."applicant_document_purpose" AS ENUM('cv', 'supporting');--> statement-breakpoint
CREATE TYPE "public"."applicant_example_kind" AS ENUM('cover_letter', 'question_answer');--> statement-breakpoint
CREATE TABLE "applicant_document" (
	"user_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"purpose" "applicant_document_purpose" NOT NULL,
	"is_default_cv" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicant_document_user_id_document_id_pk" PRIMARY KEY("user_id","document_id"),
	CONSTRAINT "applicant_document_default_cv_purpose_valid" CHECK (NOT "applicant_document"."is_default_cv" OR "applicant_document"."purpose" = 'cv')
);
--> statement-breakpoint
CREATE TABLE "applicant_example" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "applicant_example_kind" NOT NULL,
	"title" text NOT NULL,
	"question" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicant_example_title_not_blank" CHECK ("applicant_example"."title" ~ '[^[:space:]]'),
	CONSTRAINT "applicant_example_body_not_blank" CHECK ("applicant_example"."body" ~ '[^[:space:]]'),
	CONSTRAINT "applicant_example_question_valid" CHECK ((
                "applicant_example"."kind" = 'question_answer'
                AND "applicant_example"."question" IS NOT NULL
                AND "applicant_example"."question" ~ '[^[:space:]]'
            ) OR (
                "applicant_example"."kind" = 'cover_letter'
                AND "applicant_example"."question" IS NULL
            ))
);
--> statement-breakpoint
CREATE TABLE "applicant_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"application_email" text NOT NULL,
	"phone" text,
	"github_url" text,
	"linked_in_url" text,
	"portfolio_url" text,
	"city" text,
	"country" text,
	"current_job_title" text,
	"professional_experience_months" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicant_profile_full_name_not_blank" CHECK ("applicant_profile"."full_name" ~ '[^[:space:]]'),
	CONSTRAINT "applicant_profile_email_not_blank" CHECK ("applicant_profile"."application_email" ~ '[^[:space:]]'),
	CONSTRAINT "applicant_profile_experience_nonnegative" CHECK ("applicant_profile"."professional_experience_months" >= 0)
);
--> statement-breakpoint
ALTER TABLE "applicant_document" ADD CONSTRAINT "applicant_document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_document" ADD CONSTRAINT "applicant_document_owned_document_fk" FOREIGN KEY ("user_id","document_id") REFERENCES "public"."document"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_example" ADD CONSTRAINT "applicant_example_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_profile" ADD CONSTRAINT "applicant_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applicant_document_document_id_idx" ON "applicant_document" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applicant_document_default_cv_user_idx" ON "applicant_document" USING btree ("user_id") WHERE "applicant_document"."is_default_cv";--> statement-breakpoint
CREATE INDEX "applicant_example_user_id_created_at_idx" ON "applicant_example" USING btree ("user_id","created_at");