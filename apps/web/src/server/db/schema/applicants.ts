import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/server/db/schema/auth";
import { document } from "@/server/db/schema/documents";

export const applicantDocumentPurpose = pgEnum("applicant_document_purpose", [
    "cv",
    "supporting",
]);

export const applicantExampleKind = pgEnum("applicant_example_kind", [
    "cover_letter",
    "question_answer",
]);

export const applicantProfile = pgTable(
    "applicant_profile",
    {
        userId: text("user_id")
            .primaryKey()
            .references(() => user.id, { onDelete: "cascade" }),
        fullName: text("full_name").notNull(),
        applicationEmail: text("application_email").notNull(),
        phone: text("phone"),
        githubUrl: text("github_url"),
        linkedInUrl: text("linked_in_url"),
        portfolioUrl: text("portfolio_url"),
        city: text("city"),
        country: text("country"),
        currentJobTitle: text("current_job_title"),
        professionalExperienceMonths: integer("professional_experience_months"),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        check("applicant_profile_full_name_not_blank", sql`${table.fullName} ~ '[^[:space:]]'`),
        check("applicant_profile_email_not_blank", sql`${table.applicationEmail} ~ '[^[:space:]]'`),
        check(
            "applicant_profile_experience_nonnegative",
            sql`${table.professionalExperienceMonths} >= 0`,
        ),
    ],
);

export const applicantDocument = pgTable(
    "applicant_document",
    {
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        documentId: uuid("document_id").notNull(),
        purpose: applicantDocumentPurpose("purpose").notNull(),
        isDefaultCv: boolean("is_default_cv").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.documentId] }),
        foreignKey({
            name: "applicant_document_owned_document_fk",
            columns: [table.userId, table.documentId],
            foreignColumns: [document.userId, document.id],
        }).onDelete("cascade"),
        index("applicant_document_document_id_idx").on(table.documentId),
        uniqueIndex("applicant_document_default_cv_user_idx")
            .on(table.userId)
            .where(sql`${table.isDefaultCv}`),
        check(
            "applicant_document_default_cv_purpose_valid",
            sql`NOT ${table.isDefaultCv} OR ${table.purpose} = 'cv'`,
        ),
    ],
);

export const applicantExample = pgTable(
    "applicant_example",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        kind: applicantExampleKind("kind").notNull(),
        title: text("title").notNull(),
        question: text("question"),
        body: text("body").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("applicant_example_user_id_created_at_idx").on(table.userId, table.createdAt),
        check("applicant_example_title_not_blank", sql`${table.title} ~ '[^[:space:]]'`),
        check("applicant_example_body_not_blank", sql`${table.body} ~ '[^[:space:]]'`),
        check(
            "applicant_example_question_valid",
            sql`(
                ${table.kind} = 'question_answer'
                AND ${table.question} IS NOT NULL
                AND ${table.question} ~ '[^[:space:]]'
            ) OR (
                ${table.kind} = 'cover_letter'
                AND ${table.question} IS NULL
            )`,
        ),
    ],
);

export const applicantProfileRelations = relations(applicantProfile, ({ one }) => ({
    user: one(user, {
        fields: [applicantProfile.userId],
        references: [user.id],
    }),
}));

export const applicantDocumentRelations = relations(applicantDocument, ({ one }) => ({
    user: one(user, {
        fields: [applicantDocument.userId],
        references: [user.id],
    }),
    document: one(document, {
        fields: [applicantDocument.userId, applicantDocument.documentId],
        references: [document.userId, document.id],
    }),
}));

export const applicantExampleRelations = relations(applicantExample, ({ one }) => ({
    user: one(user, {
        fields: [applicantExample.userId],
        references: [user.id],
    }),
}));

export type ApplicantProfileRow = typeof applicantProfile.$inferSelect;
export type NewApplicantProfileRow = typeof applicantProfile.$inferInsert;
export type ApplicantDocumentRow = typeof applicantDocument.$inferSelect;
export type NewApplicantDocumentRow = typeof applicantDocument.$inferInsert;
export type ApplicantExampleRow = typeof applicantExample.$inferSelect;
export type NewApplicantExampleRow = typeof applicantExample.$inferInsert;
