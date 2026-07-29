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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && !env.VITE_API_URL?.trim()) {
    throw new Error(
      "VITE_API_URL is required for production builds so API requests do not fall through to the frontend.",
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
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
