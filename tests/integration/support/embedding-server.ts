import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export interface TestEmbeddingServer {
    url: string;
    stop(): Promise<void>;
}

async function reservePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolveListening, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListening); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port allocated");
    await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
    return address.port;
}

export async function startEmbeddingServer(): Promise<TestEmbeddingServer> {
    const port = await reservePort();
    const url = `http://127.0.0.1:${port}`;
    const process = spawn(resolve("worker/.venv/bin/python"), ["-m", "ragnarok_ingestion.embedding_server"], {
        cwd: resolve("worker"), env: { ...globalThis.process.env, EMBEDDING_HOST: "127.0.0.1", EMBEDDING_PORT: String(port),
            EMBEDDING_MODEL_DIR: resolve("worker/models/bge-small-en-v1.5"), HF_HUB_OFFLINE: "1" },
        stdio: "ignore",
    });
    let failed = false;
    process.on("error", () => { failed = true; });
    const stopped = new Promise<void>((resolveStopped) => process.once("close", () => resolveStopped()));
    async function stop(): Promise<void> {
        if (process.exitCode !== null || process.signalCode !== null || failed) return;
        process.kill("SIGINT");
        const force = setTimeout(() => process.kill("SIGKILL"), 3000);
        await stopped;
        clearTimeout(force);
    }
    try {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            if (failed || process.exitCode !== null) throw new Error("Embedding test service exited. Check Python dependencies and provisioned model files.");
            try {
                const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
                if (response.ok) return { url, stop };
            } catch { /* Wait for model startup. */ }
            await delay(100);
        }
        throw new Error("Embedding test service startup timed out");
    } catch (error: unknown) {
        await stop();
        throw error;
    }
}
