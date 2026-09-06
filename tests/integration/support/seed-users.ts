import { user } from "@/server/db/auth-schema";
import type { Database } from "@/server/db/client";

import type { UserFixture } from "../../fixtures/users";

export async function seedUser(
    database: Database,
    fixture: UserFixture,
): Promise<void> {
    await database.insert(user).values({
        email: fixture.email,
        id: fixture.id,
        name: fixture.name,
    });
}
