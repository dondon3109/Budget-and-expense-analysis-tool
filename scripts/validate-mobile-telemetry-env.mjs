import { pathToFileURL } from "node:url";

const APPROVED_POSTHOG_HOSTS = new Set(["https://us.i.posthog.com", "https://eu.i.posthog.com"]);

const VALID_DISABLE_VALUES = new Set(["", "0", "1", "false", "true"]);

function readValue(environment, name) {
  const raw = environment[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Validates the public values embedded in signed APKs and production OTAs.
 * The API key is deliberately never included in errors or returned to callers.
 */
export function validateMobileTelemetryEnvironment(environment = process.env) {
  const apiKey = readValue(environment, "EXPO_PUBLIC_POSTHOG_KEY");
  const host = readValue(environment, "EXPO_PUBLIC_POSTHOG_HOST");
  const disabled = readValue(environment, "EXPO_PUBLIC_TELEMETRY_DISABLED").toLowerCase();

  if (!VALID_DISABLE_VALUES.has(disabled)) {
    throw new Error("EXPO_PUBLIC_TELEMETRY_DISABLED must be empty, 0, 1, false, or true.");
  }

  const hardDisabled = disabled === "1" || disabled === "true";
  if (hardDisabled) {
    return { enabled: false, host: host || undefined };
  }

  if (!apiKey) {
    throw new Error(
      "EXPO_PUBLIC_POSTHOG_KEY is required for production Android builds unless telemetry is explicitly hard-disabled.",
    );
  }
  if (!/^phc_[A-Za-z0-9_-]+$/.test(apiKey)) {
    throw new Error(
      "EXPO_PUBLIC_POSTHOG_KEY must be a PostHog project API key beginning with phc_.",
    );
  }
  if (!APPROVED_POSTHOG_HOSTS.has(host)) {
    throw new Error(
      "EXPO_PUBLIC_POSTHOG_HOST must be https://us.i.posthog.com or https://eu.i.posthog.com.",
    );
  }

  return { enabled: true, host };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = validateMobileTelemetryEnvironment();
    console.log(
      config.enabled
        ? `Mobile crash telemetry configuration is valid (${config.host}).`
        : "Mobile crash telemetry is explicitly hard-disabled for this artifact.",
    );
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
