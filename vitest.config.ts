import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: unknown };

if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
  throw new Error("The root package.json must provide a valid version.");
}

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./tests/cloudflare-workers-shim.ts", import.meta.url),
      ),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __ASSISTANT_VOICE_ENABLED__: false,
    __ASSISTANT_VOICE_REVIEW_REQUIRED__: true,
  },
  test: {
    // One project per workspace so `--project <name>` scopes a run. Projects inherit this root
    // config and Vitest concatenates arrays, so setupFiles, define, and the alias stay here and
    // only include moves into each project.
    projects: [
      { test: { name: "api", include: ["apps/api/tests/**/*.test.{ts,tsx}"] } },
      { test: { name: "web", include: ["apps/web/tests/**/*.test.{ts,tsx}"] } },
      { test: { name: "shared", include: ["packages/shared/tests/**/*.test.{ts,tsx}"] } },
      { test: { name: "scripts", include: ["scripts/**/*.test.mjs"] } },
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
