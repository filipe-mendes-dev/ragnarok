import path from "node:path";

import {
    PostgreSqlContainer,
    type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";

import * as schema from "@/server/db/schema";

const POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg18-bookworm";

let postgresContainer: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
    postgresContainer = await new PostgreSqlContainer(POSTGRES_IMAGE)
        .withDatabase("ragnarok_test")
        .withUsername("ragnarok_test")
        .withPassword("ragnarok_test")
        .withStartupTimeout(120_000)
        .start();

    const databaseUrl = postgresContainer.getConnectionUri();
    const migrationPool = new Pool({ connectionString: databaseUrl });
    const migrationDatabase = drizzle({ client: migrationPool, schema });

    try {
        try {
            await migrate(migrationDatabase, {
                migrationsFolder: path.resolve(process.cwd(), "drizzle"),
            });
        } finally {
            await migrationPool.end();
        }
    } catch (error: unknown) {
        await postgresContainer.stop();
        postgresContainer = undefined;
        throw error;
    }

    project.provide("databaseUrl", databaseUrl);
}

export async function teardown(): Promise<void> {
    await postgresContainer?.stop();
    postgresContainer = undefined;
}
