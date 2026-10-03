import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./db/schema.ts",
    "./db/schema-providers.ts",
    "./db/schema-goals.ts",
    "./db/schema-fx.ts",
  ],
  out: "./db/migrations",
});
