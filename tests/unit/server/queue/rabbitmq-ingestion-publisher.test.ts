import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import type { IngestionJobInput } from "@/server/modules/ingestion/ingestion-input";
import {
    IngestionPublishError,
    publishIngestionJob,
} from "@/server/queue/rabbitmq-ingestion-publisher";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("amqplib", () => ({ connect }));

const job: IngestionJobInput = {
    version: 1,
    documentId: "c186bf9b-4ac2-4a43-8e1b-62d2d9963cab",
    revision: 2,
    userId: "owner",
};

function createTransport() {
    const channel = Object.assign(new EventEmitter(), {
        assertQueue: vi.fn().mockResolvedValue({}),
        sendToQueue: vi.fn().mockReturnValue(true),
        waitForConfirms: vi.fn().mockResolvedValue(undefined),
    });
    const connection = Object.assign(new EventEmitter(), {
        createConfirmChannel: vi.fn().mockResolvedValue(channel),
        close: vi.fn().mockResolvedValue(undefined),
    });
    connect.mockResolvedValue(connection);
    return { channel, connection };
}

describe("publishIngestionJob failure boundaries", () => {
    beforeEach(() => {
        vi.stubEnv("INGESTION_QUEUE_NAME", "test.ingestion");
        vi.stubEnv("INGESTION_REJECTED_QUEUE_NAME", "test.rejected");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    it("validates the job before opening a connection", async () => {
        await expect(publishIngestionJob("amqp://unused", { ...job, revision: 0 }))
            .rejects.toBeInstanceOf(ZodError);
        expect(connect).not.toHaveBeenCalled();
    });

    it("rejects a mandatory return even when RabbitMQ confirms the publication", async () => {
        const { channel } = createTransport();
        channel.sendToQueue.mockImplementation(() => {
            channel.emit("return");
            return true;
        });

        await expect(publishIngestionJob("amqp://unused", job))
            .rejects.toEqual(new IngestionPublishError("unroutable"));
    });

    it("does not report success before a broker confirmation arrives", async () => {
        const { channel } = createTransport();
        const confirmation = Promise.withResolvers<void>();
        channel.waitForConfirms.mockReturnValue(confirmation.promise);
        let finished = false;
        const publication = publishIngestionJob("amqp://unused", job).then(() => {
            finished = true;
        });
        await vi.waitFor(() => expect(channel.waitForConfirms).toHaveBeenCalled());
        expect(finished).toBe(false);
        confirmation.resolve();
        await publication;
        expect(finished).toBe(true);
    });

    it("bounds a stalled connection and aborts its socket", async () => {
        vi.useFakeTimers();
        let socketSignal: AbortSignal | undefined;
        connect.mockImplementation((_url: string, options: { signal: AbortSignal }) => {
            socketSignal = options.signal;
            return new Promise<never>(() => undefined);
        });
        const result = expect(publishIngestionJob("amqp://unused", job))
            .rejects.toEqual(new IngestionPublishError("timeout"));
        await vi.advanceTimersByTimeAsync(10_000);
        await result;
        expect(socketSignal?.aborted).toBe(true);
    });

    it("times out when the broker never confirms a sent message", async () => {
        vi.useFakeTimers();
        const { channel } = createTransport();
        channel.waitForConfirms.mockReturnValue(new Promise<never>(() => undefined));
        const result = expect(publishIngestionJob("amqp://unused", job))
            .rejects.toEqual(new IngestionPublishError("timeout"));
        await vi.advanceTimersByTimeAsync(10_000);
        await result;
        expect(channel.sendToQueue).toHaveBeenCalledOnce();
    });
});
