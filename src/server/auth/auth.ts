import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";

import { getAuthenticationEnvironment } from "@/server/auth/auth-env";
import { database } from "@/server/db/client";
import * as schema from "@/server/db/schema";

const environment = getAuthenticationEnvironment();

export const auth = betterAuth({
    appName: "RAGnarok",
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
        provider: "pg",
        schema,
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
    },
    socialProviders: {
        github: {
            clientId: environment.GITHUB_CLIENT_ID,
            clientSecret: environment.GITHUB_CLIENT_SECRET,
        },
    },
    rateLimit: {
        storage: "database",
    },
});
