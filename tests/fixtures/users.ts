import { randomUUID } from "node:crypto";

export interface UserFixture {
    email: string;
    id: string;
    name: string;
}

export function createUserFixture(
    overrides: Partial<UserFixture> = {},
): UserFixture {
    const id = overrides.id ?? `test-${randomUUID()}`;

    return {
        email: overrides.email ?? `${id}@example.test`,
        id,
        name: overrides.name ?? "Test user",
    };
}
