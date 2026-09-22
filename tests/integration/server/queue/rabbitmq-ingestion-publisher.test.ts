import { S3Client, CreateBucketCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import { createDocumentUploadService } from "@/server/modules/documents/document-upload-service";
import { createS3DocumentObjectStorage } from "@/server/storage/s3-document-object-storage";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentService } from "@/server/modules/documents/document-service";
import { createIntegrationDatabase } from "../../support/database";
import { createUserSeeder } from "../../support/seeders/users";
import { readPersistedDocument } from "../../support/read-documents";
import { startEmbeddingServer, type TestEmbeddingServer } from "../../support/embedding-server";
import { createRetrievalService } from "@/server/modules/retrieval/retrieval-service";

import type { IngestionJobInput } from "@/server/modules/ingestion/ingestion-input";
import {
    IngestionPublishError,
    publishIngestionJob,
} from "@/server/queue/rabbitmq-ingestion-publisher";

const INGESTION_QUEUE_NAME = "test.ingestion";
const REJECTED_INGESTION_QUEUE_NAME = "test.rejected";

const job: IngestionJobInput = {
    version: 1,
    documentId: "c186bf9b-4ac2-4a43-8e1b-62d2d9963cab",
    revision: 2,
    userId: "publisher-test-owner",
};

describe("publishIngestionJob", () => {
    const { database, databasePool } = createIntegrationDatabase();
    const userSeeder = createUserSeeder(database);
    let storage: StartedTestContainer;
    let s3: S3Client;
    let storageEndpoint: string;
    let broker: StartedTestContainer;
    let connection: ChannelModel;
    let channel: Channel;
    let rabbitmqUrl: string;
    let embeddings: TestEmbeddingServer;

    beforeAll(async () => {
        embeddings = await startEmbeddingServer();
        vi.stubEnv("EMBEDDING_SERVICE_URL", embeddings.url);
        vi.stubEnv("INGESTION_QUEUE_NAME", INGESTION_QUEUE_NAME);
        vi.stubEnv("INGESTION_REJECTED_QUEUE_NAME", REJECTED_INGESTION_QUEUE_NAME);
        broker = await new GenericContainer("rabbitmq:4-management")
            .withEnvironment({ RABBITMQ_DEFAULT_USER: "test", RABBITMQ_DEFAULT_PASS: "test" })
            .withExposedPorts(5672)
            .withWaitStrategy(Wait.forLogMessage("Server startup complete"))
            .withStartupTimeout(120_000)
            .start();
        rabbitmqUrl = `amqp://test:test@${broker.getHost()}:${broker.getMappedPort(5672)}/`;
        storage = await new GenericContainer("minio/minio:RELEASE.2025-07-23T15-54-02Z")
            .withEnvironment({ MINIO_ROOT_USER: "testuser", MINIO_ROOT_PASSWORD: "testpassword" })
            .withCommand(["server", "/data"])
            .withExposedPorts(9000)
            .withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000))
            .start();
        storageEndpoint = `http://${storage.getHost()}:${storage.getMappedPort(9000)}`;
        s3 = new S3Client({ endpoint: storageEndpoint, region: "us-east-1", forcePathStyle: true,
            credentials: { accessKeyId: "testuser", secretAccessKey: "testpassword" } });
        await s3.send(new CreateBucketCommand({ Bucket: "ingestion-test" }));
        connection = await connect(rabbitmqUrl);
        channel = await connection.createChannel();
    });

    beforeEach(() => {
        vi.stubEnv("RABBITMQ_URL", rabbitmqUrl);
    });

    afterEach(async () => {
        vi.stubEnv("RABBITMQ_URL", rabbitmqUrl);
        await userSeeder.cleanup();
        await channel?.deleteQueue(INGESTION_QUEUE_NAME);
        await channel?.deleteQueue(REJECTED_INGESTION_QUEUE_NAME);
    });

    afterAll(async () => {
        vi.unstubAllEnvs();
        try {
            await connection?.close();
        } finally {
            s3?.destroy();
            await storage?.stop();
            await broker?.stop();
            await embeddings?.stop();
            await databasePool.end();
        }
    });

    it.each(["text", "pdf", "oversized", "missing"] as const)("chunks a submitted %s document through the real Python worker", async (sourceType) => {
        const owner = await userSeeder.seed({ name: "Pipeline owner" });
        const service = createDocumentService(createDocumentRepository(database),
            publishIngestionJob);
        const worker = spawn(resolve("worker/.venv/bin/python"), ["-m", "ragnarok_ingestion"], {
            cwd: resolve("worker"),
            env: { ...process.env, DATABASE_URL: inject("databaseUrl"), RABBITMQ_URL: rabbitmqUrl,
                EMBEDDING_SERVICE_URL: embeddings.url,
                EMBEDDING_MODEL_DIR: resolve("worker/models/bge-small-en-v1.5"), HF_HUB_OFFLINE: "1",
                S3_ENDPOINT: storageEndpoint, S3_REGION: "us-east-1", S3_BUCKET: "ingestion-test",
                S3_ACCESS_KEY_ID: "testuser", S3_SECRET_ACCESS_KEY: "testpassword",
                S3_FORCE_PATH_STYLE: "true", PDF_MAX_UPLOAD_SIZE_BYTES: sourceType === "oversized" ? "1" : "10485760" },
            stdio: "ignore",
        });
        let workerError: Error | undefined;
        worker.on("error", (error) => { workerError = error; });
        const stopped = new Promise<void>((resolveStopped) => worker.once("close", () => resolveStopped()));
        try {
            let documentId: string;
            if (sourceType === "text") {
                const saved = await service.createTextDocument(owner.id, {
                    title: "Pipeline notes", sourceText: "Text submitted from TypeScript and chunked by Python.",
                });
                documentId = saved.id;
            } else {
                const pdf = await readFile(resolve("worker/tests/fixtures/pdf/three-pages.pdf"));
                const uploads = createDocumentUploadService(createDocumentRepository(database),
                    createS3DocumentObjectStorage(s3, "ingestion-test"),
                    async (input) => {
                        if (sourceType === "missing") {
                            const source = await readPersistedDocument(database, input.documentId);
                            if (!source?.storageKey) throw new Error("PDF has no storage key");
                            await s3.send(new DeleteObjectCommand({ Bucket: "ingestion-test", Key: source.storageKey }));
                        }
                        await publishIngestionJob(input);
                    });
                const upload = await uploads.startPdfUpload(owner.id, {
                    title: "PDF pipeline", originalFilename: "source.pdf", mimeType: "application/pdf", sizeBytes: pdf.length,
                });
                documentId = upload.documentId;
                const source = await readPersistedDocument(database, documentId);
                if (!source?.storageKey) throw new Error("PDF has no storage key");
                await s3.send(new PutObjectCommand({ Bucket: "ingestion-test", Key: source.storageKey,
                    Body: pdf, ContentType: "application/pdf" }));
                await uploads.completePdfUpload(owner.id, documentId);
            }
            const expectedError = sourceType === "missing" ? "The original PDF could not be found."
                : sourceType === "oversized" ? "PDF exceeds the configured upload size limit." : null;
            await vi.waitFor(async () => {
                if (workerError) throw workerError;
                expect(worker.exitCode).toBeNull();
                expect(await readPersistedDocument(database, documentId)).toMatchObject({
                    status: expectedError ? "failed" : "completed", processingError: expectedError,
                });
            }, { timeout: 20_000, interval: 100 });
            const chunks = await database.query.documentChunk.findMany({
                where: (chunk, { eq }) => eq(chunk.documentId, documentId),
            });
            expect(chunks.sort((a, b) => a.ordinal - b.ordinal).map(({ ordinal, text, pageNumber, revision }) =>
                ({ ordinal, text, pageNumber, revision }))).toEqual(expectedError ? [] : sourceType === "text" ? [
                { ordinal: 0, text: "Text submitted from TypeScript and chunked by Python.", pageNumber: null, revision: 1 },
            ] : [
                { ordinal: 0, text: "Alpha beta gamma delta", pageNumber: 1, revision: 1 },
                { ordinal: 1, text: "One two three four", pageNumber: 3, revision: 1 },
            ]);
            for (const chunk of chunks) {
                expect(chunk.embeddingModel).toBe("BAAI/bge-small-en-v1.5");
                expect(chunk.embeddingRevision).toBe("Qdrant/bge-small-en-v1.5-onnx-Q@52398278842ec682c6f32300af41344b1c0b0bb2");
                expect(chunk.embedding).toHaveLength(384);
                expect(chunk.embedding?.every(Number.isFinite)).toBe(true);
                expect(chunk.embedding?.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 5);
            }
            if (!expectedError) {
                const retrieved = await createRetrievalService(database).retrieve(owner.id, {
                    query: sourceType === "text" ? "How was the text submitted and chunked?" : "What does the source say about alpha beta?",
                    scope: { mode: "selected", documentIds: [documentId] },
                });
                expect(retrieved.chunks.map((chunk) => chunk.chunkId).sort()).toEqual(chunks.map((chunk) => chunk.id).sort());
            }
        } finally {
            worker.kill("SIGINT");
            const forceStop = setTimeout(() => worker.kill("SIGKILL"), 3000);
            await stopped;
            clearTimeout(forceStop);
        }
    });

    it("retains a persistent job without a running consumer and matches Python queue settings", async () => {
        await publishIngestionJob(job);

        // These are the literal declaration arguments used by the Python consumer.
        await channel.assertQueue(INGESTION_QUEUE_NAME, {
            durable: true,
            arguments: {
                "x-dead-letter-exchange": "",
                "x-dead-letter-routing-key": REJECTED_INGESTION_QUEUE_NAME,
            },
        });
        const message = await channel.get(INGESTION_QUEUE_NAME);
        expect(message).not.toBe(false);
        if (!message) {
            throw new Error("Published job was not available to consume");
        }
        const body: unknown = JSON.parse(message.content.toString("utf8"));
        const deliveryMode: unknown = message.properties.deliveryMode;
        const contentType: unknown = message.properties.contentType;
        const messageId: unknown = message.properties.messageId;
        expect(body).toEqual(job);
        expect(deliveryMode).toBe(2);
        expect(contentType).toBe("application/json");
        expect(messageId).toBe(`ingestion:${job.documentId}:${job.revision}`);
        channel.ack(message);
        expect(await channel.get(INGESTION_QUEUE_NAME)).toBe(false);
    });

    it("rejects incompatible queue configuration instead of reporting successful publication", async () => {
        await channel.assertQueue(INGESTION_QUEUE_NAME, { durable: true });

        await expect(publishIngestionJob(job)).rejects.toMatchObject({
            name: "IngestionPublishError",
            code: "unavailable",
        });
        expect(await channel.get(INGESTION_QUEUE_NAME)).toBe(false);
    });

    it("returns a safe error when broker authentication fails", async () => {
        const invalidUrl = new URL(rabbitmqUrl);
        invalidUrl.password = "private-invalid-password";

        vi.stubEnv("RABBITMQ_URL", invalidUrl.toString());
        await expect(publishIngestionJob(job)).rejects.toEqual(
            new IngestionPublishError("unavailable"),
        );
    });
});
