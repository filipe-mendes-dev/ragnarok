import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    environment: "node",
                    include: ["tests/unit/**/*.test.{ts,tsx}"],
                    name: "unit",
                },
            },
            {
                extends: true,
                test: {
                    environment: "node",
                    fileParallelism: false,
                    globalSetup: ["tests/integration/global-setup.ts"],
                    hookTimeout: 120_000,
                    include: ["tests/integration/**/*.test.{ts,tsx}"],
                    name: "integration",
                    testTimeout: 30_000,
                },
            },
        ],
    },
});
