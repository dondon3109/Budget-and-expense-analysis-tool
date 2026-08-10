import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import {
  addContentSecurityPolicy,
  createContentSecurityPolicy,
  resolveDeployEnvironment,
  validateDeploymentConfigForBuild,
  verifyContentSecurityPolicy,
  type ResolvedDeploymentConfig,
} from "./deployment-config";

const rootPackagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { version?: unknown };

if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
  throw new Error("The root package.json must provide a valid version.");
}

const appVersion = rootPackage.version;

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
        readFileSync(headersPath, "utf8"),
        contentSecurityPolicy,
      );
      verifyContentSecurityPolicy(headers, contentSecurityPolicy);
      writeFileSync(headersPath, headers);
      writeFileSync(
        resolve(outputDirectory, ".zoption-deployment.json"),
        `${JSON.stringify({ ...deploymentConfig, contentSecurityPolicy }, null, 2)}\n`,
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
    analyticsMeasurementId: env.VITE_GA_MEASUREMENT_ID,
    cloudflareAnalyticsToken: env.VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN,
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
    },
    server: {
      proxy: {
        "/api": "http://localhost:8787",
        "/health": "http://localhost:8787",
      },
    },
    build: {
      sourcemap: false,
    },
  };
});
