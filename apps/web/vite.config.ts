import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && !env.VITE_API_URL?.trim()) {
    throw new Error(
      "VITE_API_URL is required for production builds so API requests do not fall through to the frontend.",
    );
  }

  return {
    plugins: [react(), tailwindcss()],
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
