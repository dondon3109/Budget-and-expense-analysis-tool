const deployEnvironments = ["production", "preview", "staging"] as const;
const productionApiOrigin = "https://api.zoption.site";

export type DeployEnvironment = (typeof deployEnvironments)[number];

export interface DeploymentConfigInput {
  command: string;
  deployEnvironment: DeployEnvironment;
  effectiveApiUrl?: string;
  explicitApiUrl?: string;
  effectiveSupabaseUrl?: string;
  explicitSupabaseUrl?: string;
  effectiveSupabasePublishableKey?: string;
  explicitSupabasePublishableKey?: string;
  posthogKey?: string;
  posthogHost?: string;
  requirePosthog?: boolean;
}

export interface ResolvedDeploymentConfig {
  deployEnvironment: DeployEnvironment;
  apiOrigin: string;
  supabaseOrigin: string;
  posthogEnabled: boolean;
  posthogHost: string;
}

const stableVersionPattern = /^\d+\.\d+\.\d+$/;

export function resolveAppVersion(packageVersion: string, releaseVersion?: string): string {
  const version = releaseVersion?.trim() || packageVersion.trim();
  if (!stableVersionPattern.test(version)) {
    throw new Error("The application version must use major.minor.patch format.");
  }
  return version;
}

export function resolveDeployEnvironment(env: Record<string, string>): DeployEnvironment {
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

function requiredValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required for deployment builds.`);
  return normalized;
}

function deploymentOrigin(
  value: string,
  name: string,
  deployEnvironment: DeployEnvironment,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL for ${deployEnvironment} builds.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS for ${deployEnvironment} builds.`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin without credentials, a path, query, or hash.`);
  }

  return url.origin;
}

function legacyAnonKeyRole(value: string): string | undefined {
  const segments = value.split(".");
  if (segments.length !== 3 || !segments[1]) return undefined;
  try {
    const payload: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null || !("role" in payload)) return undefined;
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

export function isSupabasePublishableKey(value: string): boolean {
  const normalized = value.trim();
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(normalized)) return true;
  return legacyAnonKeyRole(normalized) === "anon";
}

export function validateDeploymentConfigForBuild(
  input: DeploymentConfigInput,
): ResolvedDeploymentConfig | null {
  if (input.command !== "build") return null;

  const apiUrl = requiredValue(input.effectiveApiUrl, "VITE_API_URL");
  const supabaseUrl = requiredValue(input.effectiveSupabaseUrl, "VITE_SUPABASE_URL");
  const publishableKey = requiredValue(
    input.effectiveSupabasePublishableKey,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );

  if (input.deployEnvironment !== "production") {
    for (const [name, value] of [
      ["VITE_API_URL", input.explicitApiUrl],
      ["VITE_SUPABASE_URL", input.explicitSupabaseUrl],
      ["VITE_SUPABASE_PUBLISHABLE_KEY", input.explicitSupabasePublishableKey],
    ] as const) {
      if (!value?.trim()) {
        throw new Error(
          `${name} must be set explicitly for ${input.deployEnvironment} builds; local or production fallbacks are not allowed.`,
        );
      }
    }
  }

  const apiOrigin = deploymentOrigin(apiUrl, "VITE_API_URL", input.deployEnvironment);
  const supabaseOrigin = deploymentOrigin(
    supabaseUrl,
    "VITE_SUPABASE_URL",
    input.deployEnvironment,
  );

  if (input.deployEnvironment === "production" && apiOrigin !== productionApiOrigin) {
    throw new Error(`Production builds must use the production API at ${productionApiOrigin}.`);
  }
  if (input.deployEnvironment !== "production" && apiOrigin === productionApiOrigin) {
    throw new Error(
      `${input.deployEnvironment} builds must not use the production API at ${productionApiOrigin}.`,
    );
  }
  if (apiOrigin === supabaseOrigin) {
    throw new Error("VITE_API_URL and VITE_SUPABASE_URL must use different origins.");
  }
  if (!isSupabasePublishableKey(publishableKey)) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase sb_publishable_ key or a legacy anon key; secret and service-role keys are forbidden.",
    );
  }

  const posthogKey = input.posthogKey?.trim();
  if (input.requirePosthog && !posthogKey) {
    throw new Error("VITE_POSTHOG_KEY is required for production Pages builds.");
  }
  const rawPosthogHost = input.posthogHost?.trim() || "https://us.i.posthog.com";
  const posthogHost = deploymentOrigin(
    rawPosthogHost,
    "VITE_POSTHOG_HOST",
    input.deployEnvironment,
  );

  return {
    deployEnvironment: input.deployEnvironment,
    apiOrigin,
    supabaseOrigin,
    posthogEnabled: Boolean(posthogKey),
    posthogHost,
  };
}

/**
 * Exact origin of the public R2 Android download bucket. The install page
 * fetches android/latest.json from this origin, so connect-src must include it.
 */
export const ANDROID_DOWNLOAD_ORIGIN = "https://downloads.zoption.site";
const PAYPAL_CSP_SOURCES = [
  "https://www.paypal.com",
  "https://www.sandbox.paypal.com",
  "https://*.paypal.com",
  "https://www.paypalobjects.com",
  "https://*.paypalobjects.com",
  "https://*.venmo.com",
] as const;
const APPROVED_CSP_WILDCARD_SOURCES = new Set<string>(
  PAYPAL_CSP_SOURCES.filter((source) => source.includes("*")),
);

export function createContentSecurityPolicy(config: ResolvedDeploymentConfig): string {
  const scriptSources = ["'self'", ...PAYPAL_CSP_SOURCES];
  const imageSources = ["'self'", "data:", "blob:", config.supabaseOrigin, ...PAYPAL_CSP_SOURCES];
  // A scheme-qualified https: source does NOT cover wss: — browsers treat them
  // as different schemes, so the live voice WebSocket is blocked unless its
  // wss: origin is listed explicitly.
  const apiWebSocketOrigin = config.apiOrigin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const connectSources = [
    "'self'",
    config.supabaseOrigin,
    config.apiOrigin,
    apiWebSocketOrigin,
    ANDROID_DOWNLOAD_ORIGIN,
    ...PAYPAL_CSP_SOURCES,
  ];

  if (config.posthogEnabled) {
    connectSources.push(config.posthogHost);
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src 'self' 'unsafe-inline' ${PAYPAL_CSP_SOURCES.join(" ")}`,
    `img-src ${imageSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    ...(config.deployEnvironment === "preview" || config.deployEnvironment === "production"
      ? ["media-src 'self' blob:"]
      : []),
    `frame-src ${PAYPAL_CSP_SOURCES.join(" ")}`,
    `child-src ${PAYPAL_CSP_SOURCES.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function addAssistantVoiceMicrophonePermission(
  headers: string,
  deployEnvironment: DeployEnvironment,
): string {
  const lockedPolicy = "Permissions-Policy: camera=(), microphone=(), geolocation=()";
  if (!headers.includes(lockedPolicy)) {
    throw new Error("Expected the global Permissions-Policy to disable microphone access.");
  }
  return deployEnvironment === "preview" || deployEnvironment === "production"
    ? headers.replace(
        lockedPolicy,
        "Permissions-Policy: camera=(), microphone=(self), geolocation=()",
      )
    : headers;
}

export function addContentSecurityPolicy(headers: string, policy: string): string {
  if (!headers.startsWith("/*\n")) {
    throw new Error("Expected the global headers rule to be the first _headers rule.");
  }
  if (/^\s*Content-Security-Policy:/im.test(headers)) {
    throw new Error("The _headers template must not contain a static Content-Security-Policy.");
  }
  return headers.replace("/*\n", `/*\n  Content-Security-Policy: ${policy}\n`);
}

export function verifyContentSecurityPolicy(headers: string, expectedPolicy: string): void {
  const policies = [...headers.matchAll(/^\s*Content-Security-Policy:\s*(.+)$/gim)].map((match) =>
    match[1]?.trim(),
  );
  if (policies.length !== 1 || policies[0] !== expectedPolicy) {
    throw new Error("Generated _headers must contain exactly the environment-derived CSP.");
  }
  const unexpectedWildcardSource = expectedPolicy
    .split(/[;\s]+/)
    .find((source) => source.includes("*") && !APPROVED_CSP_WILDCARD_SOURCES.has(source));
  if (unexpectedWildcardSource) {
    throw new Error("Generated CSP contains an unapproved wildcard source.");
  }
}
