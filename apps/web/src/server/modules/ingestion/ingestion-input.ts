import { z } from "zod";

export interface IngestionJobInput {
    version: 1;
    documentId: string;
    revision: number;
    userId: string;
}

const ingestionJobInputSchema: z.ZodType<IngestionJobInput> = z.strictObject({
    version: z.literal(1),
    documentId: z.uuid(),
    revision: z.number().int().positive().max(2_147_483_647),
    userId: z.string().refine((value) => value.trim().length > 0),
});

export function parseIngestionJobInput(input: unknown): IngestionJobInput {
    return ingestionJobInputSchema.parse(input);
}
