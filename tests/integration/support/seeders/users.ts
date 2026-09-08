import { inArray } from "drizzle-orm";

import { user } from "@/server/db/schema/auth";
import type { Database } from "@/server/db/client";

import {
    createUserFixture,
    type UserFixture,
} from "../../../fixtures/users";

export function createUserSeeder(database: Database) {
    const seededUserIds: string[] = [];

    async function seed(
        overrides: Partial<UserFixture> = {},
    ): Promise<UserFixture> {
        const fixture = createUserFixture(overrides);

        await database.insert(user).values({
            email: fixture.email,
            id: fixture.id,
            name: fixture.name,
        });
        seededUserIds.push(fixture.id);

        return fixture;
    }

    async function cleanup(): Promise<void> {
        if (seededUserIds.length === 0) {
            return;
        }

        await database
            .delete(user)
            .where(inArray(user.id, [...seededUserIds]));
        seededUserIds.length = 0;
    }

    return {
        cleanup,
        seed,
    };
}
