export interface Bindings {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_AUDIENCE?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  ASSISTANT_ENABLED?: string;
  ASSISTANT_TIME_ZONE?: string;
  ASSISTANT_PROVIDER_TIMEOUT_MS?: string;
  ASSISTANT_OVERALL_TIMEOUT_MS?: string;
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
    tenant: TenantContext;
  };
}
