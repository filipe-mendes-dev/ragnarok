import { afterEach, describe, expect, it, vi } from 'vitest';

import { getGenerationEnvironment, getGenerationSettings, getRabbitmqUrl, parseServerEnvironment } from '@/server/config/env';

describe('getRabbitmqUrl', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('accepts the AMQP URL used by the publisher', () => {
        vi.stubEnv('RABBITMQ_URL', 'amqp://localhost:5672/');
        expect(getRabbitmqUrl()).toBe('amqp://localhost:5672/');
    });

    it('rejects HTTP URLs without exposing their credentials', () => {
        vi.stubEnv('RABBITMQ_URL', 'https://user:private-password@localhost');
        expect(getRabbitmqUrl).toThrow('Set RABBITMQ_URL to an amqp:// or amqps:// URL');
    });
});

function createValidEnvironment(): NodeJS.ProcessEnv {
    return {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://ragnarok:password@localhost:5432/ragnarok',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'ragnarok-documents',
        S3_ACCESS_KEY_ID: 'ragnarok',
        S3_SECRET_ACCESS_KEY: 'ragnarok_dev_secret',
        S3_FORCE_PATH_STYLE: 'true',
        PDF_MAX_UPLOAD_SIZE_BYTES: '10485760',
    };
}

describe('parseServerEnvironment', () => {
    it('parses a valid server environment', () => {
        const environment = parseServerEnvironment(createValidEnvironment());

        expect(environment.S3_FORCE_PATH_STYLE).toBe(true);
        expect(environment.PDF_MAX_UPLOAD_SIZE_BYTES).toBe(10_485_760);
        expect(environment.DATABASE_URL).toBe(
            'postgresql://ragnarok:password@localhost:5432/ragnarok',
        );
    });

    it('identifies a missing required variable without exposing other values', () => {
        const environment = createValidEnvironment();
        environment.DATABASE_URL = undefined;

        expect(() => parseServerEnvironment(environment)).toThrow(
            /DATABASE_URL/,
        );
    });

    it('uses the 10 MB PDF limit when no override is provided', () => {
        const environment = createValidEnvironment();
        environment.PDF_MAX_UPLOAD_SIZE_BYTES = undefined;

        expect(
            parseServerEnvironment(environment).PDF_MAX_UPLOAD_SIZE_BYTES,
        ).toBe(10_485_760);
    });
});

describe('getGenerationEnvironment', () => {
    it('returns null when the model or API key is missing', () => {
        expect(getGenerationEnvironment({ NODE_ENV: 'test', OPENROUTER_API_KEY: 'private-key' })).toBeNull();
        expect(getGenerationEnvironment({ NODE_ENV: 'test', GENERATION_MODEL: 'provider/model' })).toBeNull();
    });

    it('keeps the selected model configurable', () => {
        expect(getGenerationEnvironment({ NODE_ENV: 'test', OPENROUTER_API_KEY: 'private-key', GENERATION_MODEL: 'provider/model' }))
            .toEqual({ OPENROUTER_API_KEY: 'private-key', GENERATION_MODEL: 'provider/model' });
    });
});

describe('getGenerationSettings', () => {
    it('uses defaults and accepts runtime overrides', () => {
        expect(getGenerationSettings({ NODE_ENV: 'test' })).toEqual({ maxOutputTokens: 2048, timeoutMs: 45_000 });
        expect(getGenerationSettings({ NODE_ENV: 'test', GENERATION_MAX_OUTPUT_TOKENS: '3072', GENERATION_TIMEOUT_MS: '60000' }))
            .toEqual({ maxOutputTokens: 3072, timeoutMs: 60_000 });
    });

    it('rejects invalid generation limits', () => {
        expect(() => getGenerationSettings({ NODE_ENV: 'test', GENERATION_MAX_OUTPUT_TOKENS: '0' }))
            .toThrow('Set GENERATION_MAX_OUTPUT_TOKENS');
    });
});
