import { readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

const rootPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: unknown };

if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
  throw new Error("The root package.json must provide a valid version.");
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __ASSISTANT_VOICE_ENABLED__: false,
    __ASSISTANT_VOICE_REVIEW_REQUIRED__: true,
  },
  test: {
    include: [
      "packages/**/tests/**/*.test.{ts,tsx}",
      "apps/**/tests/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
