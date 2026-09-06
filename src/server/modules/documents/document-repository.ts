import { and, desc, eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import {
    document,
    type DocumentRow,
    type NewDocumentRow,
} from "@/server/db/schema/documents";

export function createDocumentRepository(databaseClient: Database) {
    async function findByIdForUser(
        userId: string,
        documentId: string,
    ): Promise<DocumentRow | null> {
        const [record] = await databaseClient
            .select()
            .from(document)
            .where(and(eq(document.id, documentId), eq(document.userId, userId)))
            .limit(1);

        return record ?? null;
    }

    async function listForUser(userId: string): Promise<DocumentRow[]> {
        return databaseClient
            .select()
            .from(document)
            .where(eq(document.userId, userId))
            .orderBy(desc(document.createdAt));
    }

    async function insert(input: NewDocumentRow): Promise<DocumentRow> {
        const [record] = await databaseClient
            .insert(document)
            .values(input)
            .returning();

        if (!record) {
            throw new Error("Document insert did not return a record");
        }

        return record;
    }

    return {
        findByIdForUser,
        listForUser,
        insert,
    };
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>;
