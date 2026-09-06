import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inject } from "vitest";

import * as schema from "@/server/db/schema";

export function createIntegrationDatabase() {
    const databasePool = new Pool({
        connectionString: inject("databaseUrl"),
        connectionTimeoutMillis: 5_000,
        max: 2,
    });
    const database = drizzle({ client: databasePool, schema });

    return {
        database,
        databasePool,
    };
}
