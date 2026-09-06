import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnvironment } from "@/server/config/env";
import * as schema from "@/server/db/schema";

interface DatabaseGlobal {
    databasePool?: Pool;
}

const databaseGlobal = globalThis as typeof globalThis & DatabaseGlobal;

function createDatabasePool(): Pool {
    const environment = getServerEnvironment();

    return new Pool({
        connectionString: environment.DATABASE_URL,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        max: 10,
    });
}

export const databasePool = databaseGlobal.databasePool ?? createDatabasePool();

if (process.env.NODE_ENV !== "production") {
    databaseGlobal.databasePool = databasePool;
}

export const database = drizzle({ client: databasePool, schema });

export type Database = typeof database;
