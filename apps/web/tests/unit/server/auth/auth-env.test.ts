import { describe, expect, it } from "vitest";

import { parseAuthenticationEnvironment } from "@/server/auth/auth-env";

function createValidEnvironment(): NodeJS.ProcessEnv {
    return {
        NODE_ENV: "test",
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "a-random-development-secret-with-32-characters",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
    };
}

describe("parseAuthenticationEnvironment", () => {
    it("parses a valid authentication environment", () => {
        const environment = parseAuthenticationEnvironment(createValidEnvironment());

        expect(environment.BETTER_AUTH_URL).toBe("http://localhost:3000");
        expect(environment.GITHUB_CLIENT_ID).toBe("github-client-id");
    });

    it("rejects an authentication secret shorter than 32 characters", () => {
        const environment = createValidEnvironment();
        environment.BETTER_AUTH_SECRET = "too-short";

        expect(() => parseAuthenticationEnvironment(environment)).toThrow(
            /BETTER_AUTH_SECRET/,
        );
    });

    it("identifies a missing GitHub client secret without exposing its value", () => {
        const environment = createValidEnvironment();
        environment.GITHUB_CLIENT_SECRET = undefined;

        expect(() => parseAuthenticationEnvironment(environment)).toThrow(
            /GITHUB_CLIENT_SECRET/,
        );
    });
});
