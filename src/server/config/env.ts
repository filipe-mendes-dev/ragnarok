import { z } from "zod";

import { DEFAULT_PDF_MAX_SIZE_BYTES } from "@/shared/documents";

export interface ServerEnvironment {
    DATABASE_URL: string;
    REDIS_URL: string;
    S3_ENDPOINT: string;
    S3_REGION: string;
    S3_BUCKET: string;
    S3_ACCESS_KEY_ID: string;
    S3_SECRET_ACCESS_KEY: string;
    S3_FORCE_PATH_STYLE: boolean;
    PDF_MAX_UPLOAD_SIZE_BYTES: number;
}

const serverEnvironmentSchema = z.object({
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((value) => value === "true"),
    PDF_MAX_UPLOAD_SIZE_BYTES: z.coerce
        .number()
        .int()
        .positive()
        .default(DEFAULT_PDF_MAX_SIZE_BYTES),
});

let cachedServerEnvironment: ServerEnvironment | undefined;

export function parseServerEnvironment(environment: NodeJS.ProcessEnv): ServerEnvironment {
    const result = serverEnvironmentSchema.safeParse(environment);

    if (!result.success) {
        const issueSummary = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");

        throw new Error(`Invalid server environment: ${issueSummary}`);
    }

    return result.data;
}

export function getServerEnvironment(): ServerEnvironment {
    cachedServerEnvironment ??= parseServerEnvironment(process.env);

    return cachedServerEnvironment;
}
