import { inArray } from "drizzle-orm";

import { user } from "@/server/db/auth-schema";
import type { Database } from "@/server/db/client";

export async function deleteTestUsers(
    database: Database,
    userIds: readonly string[],
): Promise<void> {
    if (userIds.length === 0) {
        return;
    }

    await database.delete(user).where(inArray(user.id, [...userIds]));
}
