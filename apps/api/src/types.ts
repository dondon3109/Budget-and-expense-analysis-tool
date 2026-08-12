export interface EmailSender {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

export interface Bindings {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_AUDIENCE?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  WEB_APP_URL?: string;
  EMAIL_FROM?: string;
  BUG_REPORT_TO?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  ASSISTANT_ENABLED?: string;
  ASSISTANT_TIME_ZONE?: string;
  ASSISTANT_PROVIDER_TIMEOUT_MS?: string;
  ASSISTANT_OVERALL_TIMEOUT_MS?: string;
  ASSISTANT_MEMORY_MODEL_PASS?: string;
  ASSISTANT_VOICE_ENABLED?: string;
  ASSISTANT_VOICE_REVIEW_REQUIRED?: string;
  ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS?: string;
  FISH_AUDIO_API_KEY?: string;
  FISH_AUDIO_TTS_MODEL?: string;
  POSTHOG_AI_OBSERVABILITY_ENABLED?: string;
  POSTHOG_HOST?: string;
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_AI_ENVIRONMENT?: string;
  PAYPAL_ENVIRONMENT?: "sandbox" | "production";
  PAYPAL_PRO_MONTHLY_PLAN_ID?: string;
  PAYPAL_PRO_ANNUAL_PLAN_ID?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
}

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

export interface TenantContext {
  tenantId: string;
  defaultAccountId: string;
}

export interface AppEnvironment {
  Bindings: Bindings;
  Variables: {
    authUser: AuthUser;
    accessToken: string;
    tenant: TenantContext;
  };
}
