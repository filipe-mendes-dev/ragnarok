import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import manifest from "./public/manifest.json" with { type: "json" };

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = fileURLToPath(new URL("../web/", import.meta.url));

export default defineConfig(({ mode }) => {
  const configuredUrl = loadEnv(mode, webRoot, "BETTER_AUTH_URL").BETTER_AUTH_URL?.trim();
  if (!configuredUrl || !URL.canParse(configuredUrl)) {
    throw new Error("Set BETTER_AUTH_URL to the Next.js application origin in apps/web/.env.");
  }
  const appUrl = new URL(configuredUrl);
  if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use http or https.");
  }
  if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash || appUrl.username || appUrl.password) {
    throw new Error("BETTER_AUTH_URL must be an origin without a path, query, fragment, or credentials.");
  }

  return {
    define: { __RAGNAROK_APP_URL__: JSON.stringify(appUrl.origin) },
    build: { emptyOutDir: false },
    plugins: [{
      name: "extension-app-host-permission",
      writeBundle(options) {
        if (!options.dir) throw new Error("An output directory is required to write the extension manifest.");
        const configuredManifest = { ...manifest, host_permissions: [`${appUrl.protocol}//${appUrl.hostname}/*`] };
        writeFileSync(resolve(extensionRoot, options.dir, "manifest.json"), `${JSON.stringify(configuredManifest, null, 2)}\n`);
      },
    }],
  };
});
