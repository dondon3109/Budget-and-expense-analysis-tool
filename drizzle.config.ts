import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./db/schema.ts",
    "./db/schema-providers.ts",
    "./db/schema-goals.ts",
    "./db/schema-fx.ts",
    "./db/schema-push.ts",
    "./db/schema-family.ts",
    "./db/schema-sharing.ts",
    "./db/schema-billing.ts",
  ],
  out: "./db/migrations",
});
