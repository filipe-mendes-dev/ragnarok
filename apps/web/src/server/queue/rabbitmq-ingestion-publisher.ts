import { connect } from "amqplib";
import { getIngestionQueueNames, getRabbitmqUrl } from "@/server/config/env";

import {
    parseIngestionJobInput,
    type IngestionJobInput,
} from "@/server/modules/ingestion/ingestion-input";

const PUBLICATION_TIMEOUT_MS = 10_000;

export type IngestionPublishErrorCode = "unavailable" | "unroutable" | "timeout";

export class IngestionPublishError extends Error {
    readonly code: IngestionPublishErrorCode;

    constructor(code: IngestionPublishErrorCode) {
        super(`Ingestion publication failed: ${code}`);
        this.name = "IngestionPublishError";
        this.code = code;
    }
}

/** Publishes a job; does not change document state or wait for ingestion. */
export async function publishIngestionJob(
    input: IngestionJobInput,
): Promise<void> {
    const job = parseIngestionJobInput(input);
    const rabbitmqUrl = getRabbitmqUrl();
    const queueNames = getIngestionQueueNames();
    const controller = new AbortController();
    const failure = Promise.withResolvers<never>();
    const timer = setTimeout(() => {
        failure.reject(new IngestionPublishError("timeout"));
        controller.abort();
    }, PUBLICATION_TIMEOUT_MS);

    function handleTransportError(): void {
        // Driver errors can contain credentials. Return a fixed error instead.
        failure.reject(new IngestionPublishError("unavailable"));
    }

    async function send(): Promise<void> {
        // amqplib forwards these options to Node's socket, including AbortSignal.
        const socketOptions = {
            timeout: 5_000,
            signal: controller.signal,
        };
        const connection = await connect(rabbitmqUrl, socketOptions);
        connection.on("error", handleTransportError);

        try {
            controller.signal.throwIfAborted();
            const channel = await connection.createConfirmChannel();
            channel.on("error", handleTransportError);
            channel.on("return", () => {
                failure.reject(new IngestionPublishError("unroutable"));
            });

            // Match the Python consumer, including its rejected-message routing.
            await channel.assertQueue(queueNames.rejected, { durable: true });
            await channel.assertQueue(queueNames.ingestion, {
                durable: true,
                deadLetterExchange: "",
                deadLetterRoutingKey: queueNames.rejected,
            });

            channel.sendToQueue(queueNames.ingestion, Buffer.from(JSON.stringify(job)), {
                persistent: true,
                mandatory: true,
                contentType: "application/json",
                messageId: `ingestion:${job.documentId}:${job.revision}`,
            });
            // sendToQueue returns buffer capacity, not a delivery confirmation.
            await channel.waitForConfirms();
        } finally {
            // A failed close must not mask publication's original outcome.
            await connection.close().catch(() => undefined);
        }
    }

    try {
        await Promise.race([send(), failure.promise]);
    } catch (error: unknown) {
        if (error instanceof IngestionPublishError) {
            throw error;
        }
        throw new IngestionPublishError("unavailable");
    } finally {
        clearTimeout(timer);
        // Cancel the underlying socket too; Promise.race alone cannot cancel I/O.
        controller.abort();
    }
}
