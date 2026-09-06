import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import {
    document,
    type DocumentRow,
} from "@/server/db/schema/documents";

export async function readPersistedDocument(
    database: Database,
    documentId: string,
): Promise<DocumentRow | null> {
    const [row] = await database
        .select()
        .from(document)
        .where(eq(document.id, documentId))
        .limit(1);

    return row ?? null;
}
