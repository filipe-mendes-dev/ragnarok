import { describe, expect, it } from 'vitest';

import { parseServerEnvironment } from '@/server/config/env';

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
