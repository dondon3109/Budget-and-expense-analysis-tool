// Exports one deployment environment's public build and smoke values, derived from the tracked
// Wrangler config, into the job environment. The release, preview, monitor, and Android
// workflows all read their hosts and Supabase values from here rather than repeating literals.
//
//   node scripts/export-deployment-env.mjs <production|preview>   (writes to GITHUB_ENV)
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseJsonc } from "./validate-deployment-config.mjs";

const configPath = resolve(import.meta.dirname, "../apps/api/wrangler.deploy.jsonc");

// The hosts Wrangler config does not carry. Preview runs on provider hostnames: the Worker's
// workers.dev route and the public site's Pages project (`zoption-site-preview`).
const hosts = {
  production: { api: "https://api.zoption.site", site: "https://zoption.site" },
  preview: {
    api: "https://budget-expense-api-preview.dondon3109.workers.dev",
    site: "https://zoption-site-preview.pages.dev",
  },
};

function requiredString(record, name, environment) {
  const value = record?.[name];
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${environment} ${name} must be a single-line string.`);
  }
  return value.trim();
}

export function deploymentEnvironment(config, environment) {
  const other = environment === "production" ? "preview" : "production";
  if (!hosts[environment]) throw new Error("Environment must be production or preview.");
  const vars = config?.env?.[environment]?.vars;
  const supabaseUrl = requiredString(vars, "SUPABASE_URL", environment);
  const { api, site } = hosts[environment];
  const app = requiredString(vars, "WEB_APP_URL", environment);
  return {
    VITE_API_URL: api,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: requiredString(vars, "SUPABASE_PUBLISHABLE_KEY", environment),
    FORBIDDEN_SUPABASE_ORIGINS: requiredString(config?.env?.[other]?.vars, "SUPABASE_URL", other),
    EXPECTED_SUPABASE_URL: supabaseUrl,
    SITE_URL: site,
    APP_URL: app,
    API_URL: api,
    // The site build only reads these outside production, where they are required.
    ...(environment === "preview"
      ? { PUBLIC_API_URL: api, PUBLIC_APP_URL: app, EXPECT_SEARCH_INDEXING: "0" }
      : {}),
  };
}

export async function writeDeploymentEnvironment(config, environment, environmentPath) {
  if (!environmentPath) throw new Error("GITHUB_ENV is required.");
  const values = deploymentEnvironment(config, environment);
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`);
  await appendFile(environmentPath, `${lines.join("\n")}\n`);
  return values;
}

async function main() {
  const environment = process.argv[2];
  const config = parseJsonc(await readFile(configPath, "utf8"));
  await writeDeploymentEnvironment(config, environment, process.env.GITHUB_ENV);
  console.log(`Exported validated public ${environment} build configuration.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
