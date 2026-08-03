export interface WorkerEmailSender {
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
  EMAIL?: WorkerEmailSender;
  WEB_APP_URL?: string;
  EMAIL_FROM?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  ASSISTANT_ENABLED?: string;
  ASSISTANT_TIME_ZONE?: string;
  ASSISTANT_PROVIDER_TIMEOUT_MS?: string;
  ASSISTANT_OVERALL_TIMEOUT_MS?: string;
  ASSISTANT_MEMORY_MODEL_PASS?: string;
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
