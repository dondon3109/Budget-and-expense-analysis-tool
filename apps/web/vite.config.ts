import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import {
  addContentSecurityPolicy,
  addAssistantVoiceMicrophonePermission,
  createContentSecurityPolicy,
  resolveDeployEnvironment,
  resolveAppVersion,
  validateDeploymentConfigForBuild,
  verifyContentSecurityPolicy,
  type ResolvedDeploymentConfig,
} from "./deployment-config";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const rootPackagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { version?: unknown };

/**
 * Scratch space for the client build's handoff to `prerender.mjs`.
 *
 * This deliberately lives outside `dist/`: `dist/` is what gets deployed, and while the
 * manifest is build-time only, anything written there has to be deleted again before
 * deployment. Deleting it is what made `prerender` a single-shot command.
 */
const buildScratchDirectory = resolve(webRoot, ".zoption-build");

if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
  throw new Error("The root package.json must provide a valid version.");
}

const appVersion = resolveAppVersion(rootPackage.version, process.env.ZOPTION_RELEASE_VERSION);

function deploymentHeadersPlugin(deploymentConfig: ResolvedDeploymentConfig): Plugin {
  let outputDirectory = "";
  const contentSecurityPolicy = createContentSecurityPolicy(deploymentConfig);

  return {
    name: "zoption-deployment-headers",
    apply: "build",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const headersPath = resolve(outputDirectory, "_headers");
      const headers = addContentSecurityPolicy(
        addAssistantVoiceMicrophonePermission(
          readFileSync(headersPath, "utf8"),
          deploymentConfig.deployEnvironment,
        ),
        contentSecurityPolicy,
      );
      verifyContentSecurityPolicy(headers, contentSecurityPolicy);
      writeFileSync(headersPath, headers);
      mkdirSync(buildScratchDirectory, { recursive: true });
      writeFileSync(
        resolve(buildScratchDirectory, "deployment.json"),
        `${JSON.stringify({ ...deploymentConfig, appVersion, contentSecurityPolicy }, null, 2)}\n`,
      );
      writeFileSync(
        resolve(outputDirectory, "release.json"),
        `${JSON.stringify({ appVersion }, null, 2)}\n`,
      );
    },
  };
}

export default defineConfig(({ command, mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const deployEnvironment = resolveDeployEnvironment(env);
  const deploymentConfig = validateDeploymentConfigForBuild({
    command,
    deployEnvironment,
    effectiveApiUrl: env.VITE_API_URL,
    explicitApiUrl: process.env.VITE_API_URL,
    effectiveSupabaseUrl: env.VITE_SUPABASE_URL,
    explicitSupabaseUrl: process.env.VITE_SUPABASE_URL,
    effectiveSupabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    explicitSupabasePublishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    posthogKey: env.VITE_POSTHOG_KEY,
    posthogHost: env.VITE_POSTHOG_HOST,
    requirePosthog: env.CF_PAGES === "1" && deployEnvironment === "production",
  });

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(!isSsrBuild && deploymentConfig ? [deploymentHeadersPlugin(deploymentConfig)] : []),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __SEARCH_INDEXING_ENABLED__: JSON.stringify(deployEnvironment === "production"),
      __ASSISTANT_VOICE_ENABLED__: JSON.stringify(
        deployEnvironment === "preview" || deployEnvironment === "production",
      ),
      __ASSISTANT_VOICE_REVIEW_REQUIRED__: JSON.stringify(false),
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          ws: true,
        },
        "/health": "http://localhost:8787",
      },
    },
    build: {
      sourcemap: false,
    },
  };
});
