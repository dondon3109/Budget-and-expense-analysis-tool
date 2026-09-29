import { readFileSync } from "node:fs";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { resolveSiteDeploymentConfig } from "./deployment-config";

const rootPackage = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version?: unknown };
const appVersion = process.env.ZOPTION_RELEASE_VERSION?.trim() || rootPackage.version;
if (typeof appVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error("The release version must use major.minor.patch format.");
}

// Validated before anything renders, so a misconfigured build never starts.
const deployment = resolveSiteDeploymentConfig(process.env);

export default defineConfig({
  site: "https://zoption.site",
  output: "static",
  // Canonical URLs carry no trailing slash; `file` writes /pricing as pricing.html,
  // which Pages serves at /pricing.
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __SEARCH_INDEXING_ENABLED__: JSON.stringify(deployment.indexingEnabled),
    },
    build: {
      // Every script and asset ships as a hashed file, so the CSP needs no inline
      // allowance beyond the island bootstrap `finalize-build.mjs` hashes.
      assetsInlineLimit: 0,
      sourcemap: false,
    },
  },
});
