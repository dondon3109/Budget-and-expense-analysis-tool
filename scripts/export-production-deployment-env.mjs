import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseJsonc } from "./validate-deployment-config.mjs";

const configPath = resolve(import.meta.dirname, "../apps/api/wrangler.deploy.jsonc");

function requiredString(record, name, environment) {
  const value = record?.[name];
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${environment} ${name} must be a single-line string.`);
  }
  return value.trim();
}

export function productionDeploymentEnvironment(config) {
  const production = config?.env?.production?.vars;
  const preview = config?.env?.preview?.vars;
  const supabaseUrl = requiredString(production, "SUPABASE_URL", "production");
  return {
    VITE_API_URL: "https://api.zoption.site",
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: requiredString(
      production,
      "SUPABASE_PUBLISHABLE_KEY",
      "production",
    ),
    FORBIDDEN_SUPABASE_ORIGINS: requiredString(preview, "SUPABASE_URL", "preview"),
    EXPECTED_SUPABASE_URL: supabaseUrl,
  };
}

export async function writeProductionDeploymentEnvironment(config, environmentPath) {
  if (!environmentPath) throw new Error("GITHUB_ENV is required.");
  const environment = productionDeploymentEnvironment(config);
  const lines = Object.entries(environment).map(([name, value]) => `${name}=${value}`);
  await appendFile(environmentPath, `${lines.join("\n")}\n`);
  return environment;
}

async function main() {
  const config = parseJsonc(await readFile(configPath, "utf8"));
  await writeProductionDeploymentEnvironment(config, process.env.GITHUB_ENV);
  console.log("Exported validated public production build configuration.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
