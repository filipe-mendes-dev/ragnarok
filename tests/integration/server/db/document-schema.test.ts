import { afterAll, afterEach, describe, expect, it } from "vitest";

import { document } from "@/server/db/schema/documents";

import { createUserFixture } from "../../../fixtures/users";
import { deleteTestUsers } from "../../support/cleanup";
import { createIntegrationDatabase } from "../../support/database";
import { seedUser } from "../../support/seed-users";

interface PostgreSqlConstraintError {
    code: string;
    constraint: string;
}

const testUserIds: string[] = [];
const { database, databasePool } = createIntegrationDatabase();

function getPostgreSqlConstraintError(
    error: unknown,
): PostgreSqlConstraintError | null {
    let currentError: unknown = error;

    for (let depth = 0; depth < 3; depth += 1) {
        if (typeof currentError !== "object" || currentError === null) {
            return null;
        }

        if (
            "code" in currentError &&
            typeof currentError.code === "string" &&
            "constraint" in currentError &&
            typeof currentError.constraint === "string"
        ) {
            return {
                code: currentError.code,
                constraint: currentError.constraint,
            };
        }

        currentError = "cause" in currentError ? currentError.cause : null;
    }

    return null;
}

async function expectSourceConstraintViolation(
    operation: Promise<unknown>,
): Promise<void> {
    try {
        await operation;
        expect.fail("Expected PostgreSQL to reject the document source fields");
    } catch (error: unknown) {
        const constraintError = getPostgreSqlConstraintError(error);

        expect(constraintError).toEqual({
            code: "23514",
            constraint: "document_source_payload_valid",
        });
    }
}

describe("document source constraints", () => {
    afterEach(async () => {
        await deleteTestUsers(database, testUserIds);
        testUserIds.length = 0;
    });

    afterAll(async () => {
        await databasePool.end();
    });

    it("rejects a text document that also references object storage", async () => {
        const owner = createUserFixture({ name: "Document owner" });
        await seedUser(database, owner);
        testUserIds.push(owner.id);

        await expectSourceConstraintViolation(
            database.insert(document).values({
                userId: owner.id,
                title: "Invalid text source",
                sourceType: "text",
                sourceText: "Text cannot also point to object storage",
                storageKey: "users/owner/documents/invalid.pdf",
                originalFilename: null,
                mimeType: "text/plain",
                sizeBytes: 42,
            }),
        );
    });

    it("rejects a PDF document without an object-storage key", async () => {
        const owner = createUserFixture({ name: "Document owner" });
        await seedUser(database, owner);
        testUserIds.push(owner.id);

        await expectSourceConstraintViolation(
            database.insert(document).values({
                userId: owner.id,
                title: "Invalid PDF source",
                sourceType: "pdf",
                sourceText: null,
                storageKey: null,
                originalFilename: "invalid.pdf",
                mimeType: "application/pdf",
                sizeBytes: 42,
            }),
        );
    });
});
