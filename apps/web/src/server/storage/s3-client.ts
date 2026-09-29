import { S3Client } from "@aws-sdk/client-s3";

import { getServerEnvironment } from "@/server/config/env";

const environment = getServerEnvironment();

export const s3Client = new S3Client({
    credentials: {
        accessKeyId: environment.S3_ACCESS_KEY_ID,
        secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    },
    endpoint: environment.S3_ENDPOINT,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    region: environment.S3_REGION,
});

export const s3Bucket = environment.S3_BUCKET;
