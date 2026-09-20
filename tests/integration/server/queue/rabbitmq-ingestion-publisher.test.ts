import { connect, type Channel, type ChannelModel } from "amqplib";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, describe, expect, it, inject, vi } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createDocumentRepository } from "@/server/modules/documents/document-repository";
import { createDocumentService } from "@/server/modules/documents/document-service";
import { createIntegrationDatabase } from "../../support/database";
import { createUserSeeder } from "../../support/seeders/users";
import { readPersistedDocument } from "../../support/read-documents";

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
    let broker: StartedTestContainer;
    let connection: ChannelModel;
    let channel: Channel;
    let rabbitmqUrl: string;

    beforeAll(async () => {
        vi.stubEnv("INGESTION_QUEUE_NAME", INGESTION_QUEUE_NAME);
        vi.stubEnv("INGESTION_REJECTED_QUEUE_NAME", REJECTED_INGESTION_QUEUE_NAME);
        broker = await new GenericContainer("rabbitmq:4-management")
            .withEnvironment({ RABBITMQ_DEFAULT_USER: "test", RABBITMQ_DEFAULT_PASS: "test" })
            .withExposedPorts(5672)
            .withWaitStrategy(Wait.forLogMessage("Server startup complete"))
            .withStartupTimeout(120_000)
            .start();
        rabbitmqUrl = `amqp://test:test@${broker.getHost()}:${broker.getMappedPort(5672)}/`;
        connection = await connect(rabbitmqUrl);
        channel = await connection.createChannel();
    });

    afterEach(async () => {
        await userSeeder.cleanup();
        await channel?.deleteQueue(INGESTION_QUEUE_NAME);
        await channel?.deleteQueue(REJECTED_INGESTION_QUEUE_NAME);
    });

    afterAll(async () => {
        vi.unstubAllEnvs();
        try {
            await connection?.close();
        } finally {
            await broker?.stop();
            await databasePool.end();
        }
    });

    it("chunks a submitted text document through the real Python worker", async () => {
        const owner = await userSeeder.seed({ name: "Pipeline owner" });
        const service = createDocumentService(createDocumentRepository(database),
            (input) => publishIngestionJob(rabbitmqUrl, input));
        const worker = spawn(resolve("worker/.venv/bin/python"), ["-m", "ragnarok_ingestion"], {
            cwd: resolve("worker"),
            env: { ...process.env, DATABASE_URL: inject("databaseUrl"), RABBITMQ_URL: rabbitmqUrl },
            stdio: "ignore",
        });
        let workerError: Error | undefined;
        worker.on("error", (error) => { workerError = error; });
        const stopped = new Promise<void>((resolveStopped) => worker.once("close", () => resolveStopped()));
        try {
            const saved = await service.createTextDocument(owner.id, {
                title: "Pipeline notes", sourceText: "Text submitted from TypeScript and chunked by Python.",
            });
            await vi.waitFor(async () => {
                if (workerError) throw workerError;
                expect(worker.exitCode).toBeNull();
                expect((await readPersistedDocument(database, saved.id))?.status).toBe("completed");
            }, { timeout: 20_000, interval: 100 });
            const chunks = await database.query.documentChunk.findMany({
                where: (chunk, { eq }) => eq(chunk.documentId, saved.id),
            });
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toMatchObject({
                revision: 1, ordinal: 0, text: "Text submitted from TypeScript and chunked by Python.",
            });
        } finally {
            worker.kill("SIGINT");
            const forceStop = setTimeout(() => worker.kill("SIGKILL"), 3000);
            await stopped;
            clearTimeout(forceStop);
        }
    });

    it("retains a persistent job without a running consumer and matches Python queue settings", async () => {
        await publishIngestionJob(rabbitmqUrl, job);

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

        await expect(publishIngestionJob(rabbitmqUrl, job)).rejects.toMatchObject({
            name: "IngestionPublishError",
            code: "unavailable",
        });
        expect(await channel.get(INGESTION_QUEUE_NAME)).toBe(false);
    });

    it("returns a safe error when broker authentication fails", async () => {
        const invalidUrl = new URL(rabbitmqUrl);
        invalidUrl.password = "private-invalid-password";

        await expect(publishIngestionJob(invalidUrl.toString(), job)).rejects.toEqual(
            new IngestionPublishError("unavailable"),
        );
    });
});
