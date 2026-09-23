import { z } from "zod";

import { DEFAULT_PDF_MAX_SIZE_BYTES } from "@/shared/documents";

export interface ServerEnvironment {
    DATABASE_URL: string;
    S3_ENDPOINT: string;
    S3_REGION: string;
    S3_BUCKET: string;
    S3_ACCESS_KEY_ID: string;
    S3_SECRET_ACCESS_KEY: string;
    S3_FORCE_PATH_STYLE: boolean;
    PDF_MAX_UPLOAD_SIZE_BYTES: number;
}

export interface GenerationEnvironment {
    OPENROUTER_API_KEY: string;
    GENERATION_MODEL: string;
}

export interface GenerationSettings {
    maxOutputTokens: number;
    timeoutMs: number;
}

const DEFAULT_GENERATION_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_GENERATION_TIMEOUT_MS = 45_000;

const serverEnvironmentSchema = z.object({
    DATABASE_URL: z.url(),
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

const generationEnvironmentSchema = z.object({
    OPENROUTER_API_KEY: z.string().trim().min(1),
    GENERATION_MODEL: z.string().trim().min(1),
});

const generationSettingsSchema = z.object({
    GENERATION_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8192).default(DEFAULT_GENERATION_MAX_OUTPUT_TOKENS),
    GENERATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(DEFAULT_GENERATION_TIMEOUT_MS),
});

let cachedServerEnvironment: ServerEnvironment | undefined;

export function getRabbitmqUrl(): string {
    const result = z.url().refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "amqp:" || protocol === "amqps:";
    }).safeParse(process.env.RABBITMQ_URL);
    if (!result.success) {
        throw new Error("Set RABBITMQ_URL to an amqp:// or amqps:// URL");
    }
    return result.data;
}

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

export function getGenerationEnvironment(environment: NodeJS.ProcessEnv = process.env): GenerationEnvironment | null {
    const result = generationEnvironmentSchema.safeParse(environment);
    return result.success ? result.data : null;
}

export function getGenerationSettings(environment: NodeJS.ProcessEnv = process.env): GenerationSettings {
    const result = generationSettingsSchema.safeParse(environment);
    if (!result.success) {
        throw new Error("Set GENERATION_MAX_OUTPUT_TOKENS to 256-8192 and GENERATION_TIMEOUT_MS to 1000-120000");
    }
    return { maxOutputTokens: result.data.GENERATION_MAX_OUTPUT_TOKENS, timeoutMs: result.data.GENERATION_TIMEOUT_MS };
}

export function getIngestionQueueNames(): { ingestion: string; rejected: string } {
    const ingestion = process.env.INGESTION_QUEUE_NAME;
    const rejected = process.env.INGESTION_REJECTED_QUEUE_NAME;
    if (!ingestion?.trim() || !rejected?.trim() || ingestion === rejected) {
        throw new Error("Set distinct, nonblank INGESTION_QUEUE_NAME and INGESTION_REJECTED_QUEUE_NAME");
    }
    return { ingestion, rejected };
}
