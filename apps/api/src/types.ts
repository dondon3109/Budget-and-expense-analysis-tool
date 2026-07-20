export interface Bindings {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_AUDIENCE?: string;
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
