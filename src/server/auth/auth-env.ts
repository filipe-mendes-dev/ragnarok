import { z } from "zod";

export interface AuthenticationEnvironment {
    BETTER_AUTH_URL: string;
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
}

const authenticationEnvironmentSchema = z.object({
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
});

let cachedAuthenticationEnvironment: AuthenticationEnvironment | undefined;

export function parseAuthenticationEnvironment(
    environment: NodeJS.ProcessEnv,
): AuthenticationEnvironment {
    const result = authenticationEnvironmentSchema.safeParse(environment);

    if (!result.success) {
        const issueSummary = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");

        throw new Error(`Invalid authentication environment: ${issueSummary}`);
    }

    return result.data;
}

export function getAuthenticationEnvironment(): AuthenticationEnvironment {
    cachedAuthenticationEnvironment ??= parseAuthenticationEnvironment(process.env);

    return cachedAuthenticationEnvironment;
}
