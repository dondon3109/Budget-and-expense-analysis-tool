import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const rootPackagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { version?: unknown };

if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
  throw new Error("The root package.json must provide a valid version.");
}

const appVersion = rootPackage.version;
const deployEnvironments = ["production", "preview", "staging"] as const;
type DeployEnvironment = (typeof deployEnvironments)[number];

function resolveDeployEnvironment(env: Record<string, string>): DeployEnvironment {
  const deployEnvironment = env.ZOPTION_DEPLOY_ENV;
  if (!deployEnvironment) {
    if (env.CF_PAGES === "1") {
      throw new Error("ZOPTION_DEPLOY_ENV is required for Cloudflare Pages builds.");
    }
    return "production";
  }

  if (!deployEnvironments.includes(deployEnvironment as DeployEnvironment)) {
    throw new Error(
      `ZOPTION_DEPLOY_ENV must be one of: ${deployEnvironments.join(", ")}. Received: ${deployEnvironment}.`,
    );
  }

  return deployEnvironment as DeployEnvironment;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && !env.VITE_API_URL?.trim()) {
    throw new Error(
      "VITE_API_URL is required for production builds so API requests do not fall through to the frontend.",
    );
  }

  const deployEnvironment = resolveDeployEnvironment(env);

  return {
    plugins: [react(), tailwindcss()],
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
      sourcemap: true,
    },
  };
});
