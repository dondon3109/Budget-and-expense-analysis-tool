import { describe, expect, it } from "vitest";

import { parseJsonc, validateWranglerDeploymentConfig } from "./validate-deployment-config.mjs";

function environment({
  production = false,
  project = "shared-ref",
  key = "sb_publishable_shared",
  paypalEnvironment = "production",
} = {}) {
  return {
    ...(production ? { routes: [{ pattern: "api.zoption.site", custom_domain: true }] } : {}),
    ...(production ? {} : { ai: { binding: "AI" } }),
    d1_databases: [
      {
        binding: "DB",
        database_id: production ? "production-database-id" : "preview-database-id",
      },
    ],
    vars: {
      ALLOWED_ORIGINS: production
        ? "https://zoption.site,https://www.zoption.site"
        : "https://preview.example.pages.dev",
      SUPABASE_URL: `https://${project}.supabase.co`,
      SUPABASE_PUBLISHABLE_KEY: key,
      SUPABASE_JWT_AUDIENCE: "authenticated",
      WEB_APP_URL: production ? "https://zoption.site" : "https://preview.example.pages.dev",
      EMAIL_FROM: "hello@zoption.site",
      BUG_REPORT_TO: "support@zoption.site",
      PAYPAL_ENVIRONMENT: paypalEnvironment,
      PAYPAL_PRO_MONTHLY_PLAN_ID: production ? "P-PRODUCTION-MONTHLY" : "P-PREVIEW-MONTHLY",
      PAYPAL_PRO_ANNUAL_PLAN_ID: production ? "P-PRODUCTION-ANNUAL" : "P-PREVIEW-ANNUAL",
      ASSISTANT_VOICE_ENABLED: production ? "false" : "true",
      ASSISTANT_VOICE_REVIEW_REQUIRED: production ? "false" : "true",
      ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS: "30000",
      FISH_AUDIO_TTS_MODEL: "s2.1-pro-free",
    },
  };
}

function validConfig() {
  return {
    env: {
      preview: environment({ project: "preview-ref", key: "sb_publishable_preview" }),
      production: environment({
        production: true,
        project: "production-ref",
        key: "sb_publishable_production",
      }),
    },
  };
}

describe("Wrangler deployment config validation", () => {
  it("parses comments and trailing commas", () => {
    expect(parseJsonc('{ // comment\n "env": {},\n}')).toEqual({ env: {} });
  });

  it("accepts complete preview and production binding metadata", () => {
    expect(validateWranglerDeploymentConfig(validConfig())).toEqual(["preview", "production"]);
  });

  it("requires the AI binding only where voice transcription is enabled", () => {
    const missingPreviewBinding = validConfig();
    delete missingPreviewBinding.env.preview.ai;
    expect(() => validateWranglerDeploymentConfig(missingPreviewBinding)).toThrow(
      "preview must bind Cloudflare Workers AI as AI for voice transcription",
    );

    const productionBinding = validConfig();
    productionBinding.env.production.ai = { binding: "AI" };
    expect(() => validateWranglerDeploymentConfig(productionBinding)).toThrow(
      "production must omit the Cloudflare Workers AI binding while voice is disabled",
    );
  });

  it("requires a publishable key in every deployment environment", () => {
    const config = validConfig();
    delete config.env.production.vars.SUPABASE_PUBLISHABLE_KEY;
    expect(() => validateWranglerDeploymentConfig(config)).toThrow(
      "production is missing required SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it.each(["PAYPAL_ENVIRONMENT", "PAYPAL_PRO_MONTHLY_PLAN_ID", "PAYPAL_PRO_ANNUAL_PLAN_ID"])(
    "requires %s in every deployment environment",
    (name) => {
      const config = validConfig();
      delete config.env.preview.vars[name];
      expect(() => validateWranglerDeploymentConfig(config)).toThrow(
        `preview is missing required ${name} configuration`,
      );
    },
  );

  it("allows Preview to intentionally use either PayPal Live or Sandbox", () => {
    expect(validateWranglerDeploymentConfig(validConfig())).toEqual(["preview", "production"]);

    const sandboxPreview = validConfig();
    sandboxPreview.env.preview.vars.PAYPAL_ENVIRONMENT = "sandbox";
    expect(validateWranglerDeploymentConfig(sandboxPreview)).toEqual(["preview", "production"]);
  });

  it("applies the same PayPal namespace validation to optional Staging", () => {
    const config = validConfig();
    config.env.staging = environment({
      project: "staging-ref",
      key: "sb_publishable_staging",
      paypalEnvironment: "sandbox",
    });
    config.env.staging.vars.ALLOWED_ORIGINS = "https://staging.example.pages.dev";
    expect(validateWranglerDeploymentConfig(config)).toEqual(["preview", "production", "staging"]);

    config.env.staging.vars.PAYPAL_ENVIRONMENT = "production";
    expect(validateWranglerDeploymentConfig(config)).toEqual(["preview", "production", "staging"]);
  });

  it.each(["live", "test", ""])("rejects unsupported PayPal environment %j", (value) => {
    const config = validConfig();
    config.env.preview.vars.PAYPAL_ENVIRONMENT = value;
    expect(() => validateWranglerDeploymentConfig(config)).toThrow(
      value
        ? "preview PAYPAL_ENVIRONMENT must be sandbox or production"
        : "preview is missing required PAYPAL_ENVIRONMENT configuration",
    );
  });

  it("requires Production to use PayPal production", () => {
    const config = validConfig();
    config.env.production.vars.PAYPAL_ENVIRONMENT = "sandbox";
    expect(() => validateWranglerDeploymentConfig(config)).toThrow(
      "production PAYPAL_ENVIRONMENT must be production",
    );
  });

  it("requires non-placeholder distinct PayPal monthly and annual plan IDs", () => {
    const placeholder = validConfig();
    placeholder.env.preview.vars.PAYPAL_PRO_MONTHLY_PLAN_ID = "REPLACE_WITH_PAYPAL_MONTHLY_PLAN_ID";
    expect(() => validateWranglerDeploymentConfig(placeholder)).toThrow(
      "preview PAYPAL_PRO_MONTHLY_PLAN_ID still contains a deployment placeholder",
    );

    const duplicate = validConfig();
    duplicate.env.preview.vars.PAYPAL_PRO_ANNUAL_PLAN_ID =
      duplicate.env.preview.vars.PAYPAL_PRO_MONTHLY_PLAN_ID;
    expect(() => validateWranglerDeploymentConfig(duplicate)).toThrow(
      "preview PAYPAL_PRO_MONTHLY_PLAN_ID and PAYPAL_PRO_ANNUAL_PLAN_ID must be distinct",
    );
  });

  it("rejects secret key types without exposing their values", () => {
    const config = validConfig();
    const secret = "sb_secret_never-print-this";
    config.env.production.vars.SUPABASE_PUBLISHABLE_KEY = secret;
    let message = "";
    try {
      validateWranglerDeploymentConfig(config);
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("secret and service-role key types are forbidden");
    expect(message).not.toContain(secret);
  });

  it("rejects secrets stored in Wrangler vars", () => {
    const config = validConfig();
    config.env.preview.vars.SUPABASE_SERVICE_ROLE_KEY = "not-printed";
    expect(() => validateWranglerDeploymentConfig(config)).toThrow(
      "preview must store SUPABASE_SERVICE_ROLE_KEY as a Worker secret",
    );

    config.env.preview.vars.SUPABASE_SERVICE_ROLE_KEY = undefined;
    config.env.preview.vars.POSTHOG_PROJECT_TOKEN = "phc_never-commit";
    expect(() => validateWranglerDeploymentConfig(config)).toThrow(
      "preview must store POSTHOG_PROJECT_TOKEN as a Worker secret",
    );
  });

  it("validates optional PostHog AI Observability settings", () => {
    const config = validConfig();
    Object.assign(config.env.preview.vars, {
      POSTHOG_AI_OBSERVABILITY_ENABLED: "true",
      POSTHOG_HOST: "https://us.i.posthog.com",
      POSTHOG_AI_ENVIRONMENT: "preview",
    });
    Object.assign(config.env.production.vars, {
      POSTHOG_AI_OBSERVABILITY_ENABLED: "false",
      POSTHOG_HOST: "https://us.i.posthog.com",
      POSTHOG_AI_ENVIRONMENT: "production",
    });
    expect(validateWranglerDeploymentConfig(config)).toEqual(["preview", "production"]);

    config.env.preview.vars.POSTHOG_AI_OBSERVABILITY_ENABLED = "yes";
    expect(() => validateWranglerDeploymentConfig(config)).toThrow(
      "preview POSTHOG_AI_OBSERVABILITY_ENABLED must be the string true or false",
    );
  });

  it("rejects an unapproved PostHog host or mismatched environment label", () => {
    const wrongHost = validConfig();
    Object.assign(wrongHost.env.preview.vars, {
      POSTHOG_AI_OBSERVABILITY_ENABLED: "true",
      POSTHOG_HOST: "https://eu.i.posthog.com",
      POSTHOG_AI_ENVIRONMENT: "preview",
    });
    expect(() => validateWranglerDeploymentConfig(wrongHost)).toThrow(
      "preview POSTHOG_HOST must use the approved PostHog US Cloud origin",
    );

    const wrongEnvironment = validConfig();
    Object.assign(wrongEnvironment.env.preview.vars, {
      POSTHOG_AI_OBSERVABILITY_ENABLED: "true",
      POSTHOG_HOST: "https://us.i.posthog.com",
      POSTHOG_AI_ENVIRONMENT: "production",
    });
    expect(() => validateWranglerDeploymentConfig(wrongEnvironment)).toThrow(
      "preview POSTHOG_AI_ENVIRONMENT must be preview",
    );
  });

  it("rejects production origins in preview and cross-environment Supabase reuse", () => {
    const productionOriginConfig = validConfig();
    productionOriginConfig.env.preview.vars.ALLOWED_ORIGINS = "https://zoption.site";
    expect(() => validateWranglerDeploymentConfig(productionOriginConfig)).toThrow(
      "preview ALLOWED_ORIGINS must not include production web origins",
    );

    const sharedOriginConfig = validConfig();
    sharedOriginConfig.env.production.vars.SUPABASE_URL =
      sharedOriginConfig.env.preview.vars.SUPABASE_URL;
    expect(() => validateWranglerDeploymentConfig(sharedOriginConfig)).toThrow(
      "preview and production must use different Supabase origins",
    );

    const sharedKeyConfig = validConfig();
    sharedKeyConfig.env.production.vars.SUPABASE_PUBLISHABLE_KEY =
      sharedKeyConfig.env.preview.vars.SUPABASE_PUBLISHABLE_KEY;
    expect(() => validateWranglerDeploymentConfig(sharedKeyConfig)).toThrow(
      "preview and production must use different Supabase publishable keys",
    );
  });
});
