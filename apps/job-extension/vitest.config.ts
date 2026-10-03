import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __RAGNAROK_APP_URL__: JSON.stringify("http://localhost:3000") },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
