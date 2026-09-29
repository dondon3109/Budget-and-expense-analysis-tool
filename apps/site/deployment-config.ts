/**
 * Build-time configuration for the public site. Every value is validated here
 * and the build fails closed: production must point at the production API and
 * app, and preview builds must say where they point instead of inheriting
 * production.
 */
const deployEnvironments = ["production", "preview", "staging"] as const;
export type DeployEnvironment = (typeof deployEnvironments)[number];

const PRODUCTION_API_ORIGIN = "https://api.zoption.site";
const PRODUCTION_APP_ORIGIN = "https://app.zoption.site";
/** The install page reads android/latest.json from the public R2 bucket. */
export const ANDROID_DOWNLOAD_ORIGIN = "https://downloads.zoption.site";

export interface SiteDeploymentConfig {
  deployEnvironment: DeployEnvironment;
  indexingEnabled: boolean;
  apiOrigin: string;
  appOrigin: string;
  posthogKey: string | undefined;
}

function httpsOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin without credentials, a path, query, or hash.`);
  }
  return url.origin;
}

export function resolveSiteDeploymentConfig(
  env: Record<string, string | undefined>,
): SiteDeploymentConfig {
  const rawEnvironment = env.ZOPTION_DEPLOY_ENV;
  if (!rawEnvironment && env.CF_PAGES === "1") {
    throw new Error("ZOPTION_DEPLOY_ENV is required for Cloudflare Pages builds.");
  }
  const deployEnvironment = (rawEnvironment ?? "production") as DeployEnvironment;
  if (!deployEnvironments.includes(deployEnvironment)) {
    throw new Error(
      `ZOPTION_DEPLOY_ENV must be one of: ${deployEnvironments.join(", ")}. Received: ${rawEnvironment}.`,
    );
  }

  const production = deployEnvironment === "production";
  if (!production) {
    for (const name of ["PUBLIC_API_URL", "PUBLIC_APP_URL"] as const) {
      if (!env[name]?.trim()) {
        throw new Error(`${name} must be set explicitly for ${deployEnvironment} builds.`);
      }
    }
  }

  const apiOrigin = httpsOrigin(
    env.PUBLIC_API_URL?.trim() || PRODUCTION_API_ORIGIN,
    "PUBLIC_API_URL",
  );
  const appOrigin = httpsOrigin(
    env.PUBLIC_APP_URL?.trim() || PRODUCTION_APP_ORIGIN,
    "PUBLIC_APP_URL",
  );
  if (production && apiOrigin !== PRODUCTION_API_ORIGIN) {
    throw new Error(`Production builds must use the production API at ${PRODUCTION_API_ORIGIN}.`);
  }
  if (production && appOrigin !== PRODUCTION_APP_ORIGIN) {
    throw new Error(`Production builds must link the production app at ${PRODUCTION_APP_ORIGIN}.`);
  }
  if (!production && apiOrigin === PRODUCTION_API_ORIGIN) {
    throw new Error(`${deployEnvironment} builds must not use the production API.`);
  }

  const posthogKey = env.PUBLIC_POSTHOG_KEY?.trim() || undefined;
  if (production && env.CF_PAGES === "1" && !posthogKey) {
    throw new Error("PUBLIC_POSTHOG_KEY is required for production Pages builds.");
  }

  return { deployEnvironment, indexingEnabled: production, apiOrigin, appOrigin, posthogKey };
}

/**
 * The site runs only its own bundled scripts and talks only to itself (the
 * `/ingest` analytics proxy), the public API (support chat), and the Android
 * release bucket. No wildcard source is allowed.
 */
export function createSiteContentSecurityPolicy(config: SiteDeploymentConfig): string {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${config.apiOrigin} ${ANDROID_DOWNLOAD_ORIGIN}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  if (policy.includes("*")) throw new Error("The site CSP must not contain a wildcard source.");
  return policy;
}
