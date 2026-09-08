import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseIngestionJobInput } from "@/server/modules/ingestion/ingestion-input";

function createJobInput() {
    return {
        version: 1,
        documentId: "f3e01c92-56c6-49d7-9656-5c92e9359e71",
        revision: 1,
        userId: "user-123",
    };
}

describe("parseIngestionJobInput", () => {
    it("accepts a serialized job without changing its identity", () => {
        const input = createJobInput();
        const serialized: unknown = JSON.parse(JSON.stringify(input));

        expect(parseIngestionJobInput(serialized)).toEqual(input);
    });

    it.each([0, 2, "1", null, undefined])(
        "rejects unsupported protocol version %s",
        (version) => {
            expect(() => parseIngestionJobInput({ ...createJobInput(), version }))
                .toThrow(ZodError);
        },
    );

    it.each([0, -1, 1.5, "1", 2_147_483_648, undefined])(
        "rejects revision %s outside the PostgreSQL positive integer domain",
        (revision) => {
            expect(() => parseIngestionJobInput({ ...createJobInput(), revision }))
                .toThrow(ZodError);
        },
    );

    it.each(["", "not-a-uuid", undefined])(
        "rejects malformed document identifier %s",
        (documentId) => {
            expect(() => parseIngestionJobInput({ ...createJobInput(), documentId }))
                .toThrow(ZodError);
        },
    );

    it.each(["", "   ", undefined])(
        "rejects missing owner identity %s",
        (userId) => {
            expect(() => parseIngestionJobInput({ ...createJobInput(), userId }))
                .toThrow(ZodError);
        },
    );

    it.each(["sourceText", "storageKey", "accessToken"])(
        "rejects unexpected payload field %s",
        (field) => {
            expect(() => parseIngestionJobInput({
                ...createJobInput(),
                [field]: "must not cross the queue boundary",
            })).toThrow(ZodError);
        },
    );

    it.each([null, [], "job"])("rejects non-object input %s", (input) => {
        expect(() => parseIngestionJobInput(input)).toThrow(ZodError);
    });
});
