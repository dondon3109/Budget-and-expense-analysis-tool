import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultConfigPath = resolve(repositoryRoot, "apps/api/wrangler.deploy.jsonc");
const requiredEnvironments = ["preview", "production"];
const requiredVariables = [
  "ALLOWED_ORIGINS",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_JWT_AUDIENCE",
  "WEB_APP_URL",
  "EMAIL_FROM",
  "BUG_REPORT_TO",
  "PAYPAL_ENVIRONMENT",
  "PAYPAL_PRO_MONTHLY_PLAN_ID",
  "PAYPAL_PRO_ANNUAL_PLAN_ID",
  "ASSISTANT_VOICE_ENABLED",
  "ASSISTANT_VOICE_REVIEW_REQUIRED",
  "ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS",
  "FISH_AUDIO_TTS_MODEL",
];
const secretVariableNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "DEEPSEEK_API_KEY",
  "POSTHOG_PROJECT_TOKEN",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "FISH_AUDIO_API_KEY",
];
const productionWebOrigins = ["https://www.zoption.site", "https://zoption.site"];

function stripJsonComments(value) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < value.length && value[index] !== "\n") index += 1;
      result += "\n";
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < value.length && !(value[index] === "*" && value[index + 1] === "/")) {
        if (value[index] === "\n") result += "\n";
        index += 1;
      }
      index += 1;
      continue;
    }
    result += character;
  }
  return result;
}

function stripTrailingCommas(value) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (/\s/.test(value[lookahead] ?? "")) lookahead += 1;
      if (value[lookahead] === "}" || value[lookahead] === "]") continue;
    }
    result += character;
  }
  return result;
}

export function parseJsonc(value) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(value)));
}

function requiredString(record, name, environment) {
  const value = record?.[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${environment} is missing required ${name} configuration.`);
  }
  if (/REPLACE_WITH|YOUR_[A-Z_]+|<[^>]+>/.test(value)) {
    throw new Error(`${environment} ${name} still contains a deployment placeholder.`);
  }
  return value.trim();
}

function exactHttpsOrigin(value, name, environment) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${environment} ${name} must be a valid absolute URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${environment} ${name} must be an exact HTTPS origin.`);
  }
  return url.origin;
}

function legacyKeyRole(value) {
  const segments = value.split(".");
  if (segments.length !== 3 || !segments[1]) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

function validatePublishableKey(value, environment) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value) || legacyKeyRole(value) === "anon") return;
  throw new Error(
    `${environment} SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key; secret and service-role key types are forbidden.`,
  );
}

function validatePostHogConfig(vars, environment) {
  const enabled = vars.POSTHOG_AI_OBSERVABILITY_ENABLED;
  if (enabled !== undefined && enabled !== "true" && enabled !== "false") {
    throw new Error(
      `${environment} POSTHOG_AI_OBSERVABILITY_ENABLED must be the string true or false.`,
    );
  }

  const host = vars.POSTHOG_HOST;
  if (host !== undefined) {
    const origin = exactHttpsOrigin(host, "POSTHOG_HOST", environment);
    if (origin !== "https://us.i.posthog.com") {
      throw new Error(`${environment} POSTHOG_HOST must use the approved PostHog US Cloud origin.`);
    }
  }

  const telemetryEnvironment = vars.POSTHOG_AI_ENVIRONMENT;
  if (telemetryEnvironment !== undefined && telemetryEnvironment !== environment) {
    throw new Error(`${environment} POSTHOG_AI_ENVIRONMENT must be ${environment}.`);
  }

  if (enabled === "true") {
    requiredString(vars, "POSTHOG_HOST", environment);
    requiredString(vars, "POSTHOG_AI_ENVIRONMENT", environment);
  }
}

function validateAssistantVoiceConfig(vars, environment, config) {
  const enabled = requiredString(vars, "ASSISTANT_VOICE_ENABLED", environment);
  const reviewRequired = requiredString(vars, "ASSISTANT_VOICE_REVIEW_REQUIRED", environment);
  if (!new Set(["true", "false"]).has(enabled) || !new Set(["true", "false"]).has(reviewRequired)) {
    throw new Error(`${environment} assistant voice flags must be the strings true or false.`);
  }
  if (environment === "preview" && (enabled !== "true" || reviewRequired !== "true")) {
    throw new Error("preview must enable assistant voice with transcript review required.");
  }
  if (environment === "production" && (enabled !== "false" || reviewRequired !== "false")) {
    throw new Error("production must keep assistant voice disabled and transcript review off.");
  }
  if (enabled === "true" && config.ai?.binding !== "AI") {
    throw new Error(
      `${environment} must bind Cloudflare Workers AI as AI for voice transcription.`,
    );
  }
  if (environment === "production" && config.ai !== undefined) {
    throw new Error(
      "production must omit the Cloudflare Workers AI binding while voice is disabled.",
    );
  }
  if (requiredString(vars, "FISH_AUDIO_TTS_MODEL", environment) !== "s2.1-pro-free") {
    throw new Error(`${environment} must use the free Fish Audio TTS model s2.1-pro-free.`);
  }
  const timeout = Number(requiredString(vars, "ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS", environment));
  if (!Number.isInteger(timeout) || timeout < 5_000 || timeout > 60_000) {
    throw new Error(`${environment} ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS must be 5000-60000.`);
  }
}

function validateEnvironment(environment, config) {
  if (!config || typeof config !== "object") {
    throw new Error(`Wrangler config is missing the ${environment} environment.`);
  }
  const vars = config.vars;
  if (!vars || typeof vars !== "object") {
    throw new Error(`${environment} is missing its vars block.`);
  }
  for (const name of requiredVariables) requiredString(vars, name, environment);
  for (const name of secretVariableNames) {
    if (typeof vars[name] === "string" && vars[name].trim()) {
      throw new Error(`${environment} must store ${name} as a Worker secret, not a Wrangler var.`);
    }
  }
  validatePostHogConfig(vars, environment);
  validateAssistantVoiceConfig(vars, environment, config);

  const allowedOrigins = requiredString(vars, "ALLOWED_ORIGINS", environment)
    .split(",")
    .map((value) => exactHttpsOrigin(value.trim(), "ALLOWED_ORIGINS", environment));
  if (new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw new Error(`${environment} ALLOWED_ORIGINS contains duplicates.`);
  }
  const supabaseOrigin = exactHttpsOrigin(
    requiredString(vars, "SUPABASE_URL", environment),
    "SUPABASE_URL",
    environment,
  );
  const publishableKey = requiredString(vars, "SUPABASE_PUBLISHABLE_KEY", environment);
  validatePublishableKey(publishableKey, environment);

  const paypalEnvironment = requiredString(vars, "PAYPAL_ENVIRONMENT", environment);
  if (!new Set(["sandbox", "production"]).has(paypalEnvironment)) {
    throw new Error(`${environment} PAYPAL_ENVIRONMENT must be sandbox or production.`);
  }
  if (environment === "production" && paypalEnvironment !== "production") {
    throw new Error("production PAYPAL_ENVIRONMENT must be production.");
  }
  const monthlyPlanId = requiredString(vars, "PAYPAL_PRO_MONTHLY_PLAN_ID", environment);
  const annualPlanId = requiredString(vars, "PAYPAL_PRO_ANNUAL_PLAN_ID", environment);
  if (monthlyPlanId === annualPlanId) {
    throw new Error(
      `${environment} PAYPAL_PRO_MONTHLY_PLAN_ID and PAYPAL_PRO_ANNUAL_PLAN_ID must be distinct.`,
    );
  }

  const databases = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  const database = databases.find((candidate) => candidate?.binding === "DB");
  if (!database || typeof database.database_id !== "string" || !database.database_id.trim()) {
    throw new Error(`${environment} is missing the DB D1 binding or database ID.`);
  }
  if (/REPLACE_WITH|YOUR_[A-Z_]+/.test(database.database_id)) {
    throw new Error(`${environment} DB database ID still contains a deployment placeholder.`);
  }

  if (environment === "production") {
    const actualOrigins = [...allowedOrigins].sort();
    if (JSON.stringify(actualOrigins) !== JSON.stringify(productionWebOrigins)) {
      throw new Error(
        "production ALLOWED_ORIGINS must contain only the two production web origins.",
      );
    }
    const routes = Array.isArray(config.routes) ? config.routes : [];
    if (
      !routes.some((route) => route?.pattern === "api.zoption.site" && route.custom_domain === true)
    ) {
      throw new Error("production must declare api.zoption.site as a Worker custom domain.");
    }
  } else if (allowedOrigins.some((origin) => productionWebOrigins.includes(origin))) {
    throw new Error(`${environment} ALLOWED_ORIGINS must not include production web origins.`);
  }

  return { supabaseOrigin, publishableKey };
}

export function validateWranglerDeploymentConfig(config) {
  if (!config || typeof config !== "object") throw new Error("Wrangler config must be an object.");
  const environments = config.env;
  if (!environments || typeof environments !== "object") {
    throw new Error("Wrangler config must contain deployment environments.");
  }
  for (const environment of requiredEnvironments) {
    if (!(environment in environments)) {
      throw new Error(`Wrangler config is missing the ${environment} environment.`);
    }
  }

  const validated = new Map();
  for (const environment of [...requiredEnvironments, "staging"]) {
    if (environment in environments) {
      validated.set(environment, validateEnvironment(environment, environments[environment]));
    }
  }

  for (const [leftName, left] of validated) {
    for (const [rightName, right] of validated) {
      if (leftName >= rightName) continue;
      if (left.supabaseOrigin === right.supabaseOrigin) {
        throw new Error(`${leftName} and ${rightName} must use different Supabase origins.`);
      }
      if (left.publishableKey === right.publishableKey) {
        throw new Error(
          `${leftName} and ${rightName} must use different Supabase publishable keys.`,
        );
      }
    }
  }

  return [...validated.keys()];
}

async function main() {
  const configFlag = process.argv.indexOf("--config");
  const configPath =
    configFlag >= 0
      ? resolve(process.cwd(), process.argv[configFlag + 1] ?? "")
      : defaultConfigPath;
  const config = parseJsonc(await readFile(configPath, "utf8"));
  const environments = validateWranglerDeploymentConfig(config);
  console.log(`Deployment config validation passed for: ${environments.join(", ")}.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
