import type { AuthUser, Bindings } from "./types";
import {
  accountDeletionRepository,
  type AccountDeletionErrorCode,
  type AccountDeletionRecord,
  type AccountDeletionRepository,
  type AccountDeletionStatus,
} from "./db/account-deletion";
import { HttpError } from "./errors";

const AVATAR_BUCKET = "avatars";
const STORAGE_PAGE_SIZE = 100;

type StorageListEntry = { name: string; id?: string | null };

type GatewayFailureCode = AccountDeletionErrorCode;

class AccountDeletionGatewayError extends Error {
  constructor(readonly code: GatewayFailureCode) {
    super(code);
  }
}

export interface SupabaseDeletionGateway {
  getCurrentUser(accessToken: string): Promise<{ id: string; email: string }>;
  verifyPassword(email: string, password: string, expectedUserId: string): Promise<boolean>;
  purgeAvatars(userId: string): Promise<void>;
  hardDeleteUser(userId: string): Promise<void>;
}

export interface AccountDeletionService {
  deleteAccount(args: {
    env: Bindings;
    user: AuthUser;
    accessToken: string;
    password: string;
  }): Promise<AccountDeletionStatus>;
  reconcile(env: Bindings, limit: number): Promise<number>;
}

function requiredBinding(env: Bindings, key: "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = env[key]?.trim();
  if (!value) throw new AccountDeletionGatewayError("configuration_missing");
  return value;
}

function supabaseUrl(env: Bindings): string {
  const value = env.SUPABASE_URL?.trim();
  if (!value) throw new AccountDeletionGatewayError("configuration_missing");
  return value.replace(/\/$/, "");
}

async function jsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(response: Response, payload: unknown): boolean {
  if (response.status !== 404) return false;
  return (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string" &&
    /not found/i.test(payload.message)
  );
}

export function createSupabaseDeletionGatewayForEnvironment(
  env: Bindings,
  fetcher: typeof fetch = fetch,
): SupabaseDeletionGateway {
  const baseUrl = supabaseUrl(env);
  const publishableKey = requiredBinding(env, "SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requiredBinding(env, "SUPABASE_SERVICE_ROLE_KEY");

  async function listAvatarPaths(prefix: string): Promise<string[]> {
    const paths: string[] = [];
    let offset = 0;
    for (;;) {
      const response = await fetcher(`${baseUrl}/storage/v1/object/list/${AVATAR_BUCKET}`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix, limit: STORAGE_PAGE_SIZE, offset }),
      });
      if (!response.ok) throw new AccountDeletionGatewayError("storage_unavailable");
      const payload = await jsonResponse(response);
      if (!Array.isArray(payload)) throw new AccountDeletionGatewayError("storage_unavailable");
      const entries: StorageListEntry[] = [];
      for (const value of payload) {
        if (!isRecord(value) || typeof value.name !== "string") {
          throw new AccountDeletionGatewayError("storage_unavailable");
        }
        const id = value.id;
        if (id !== undefined && id !== null && typeof id !== "string") {
          throw new AccountDeletionGatewayError("storage_unavailable");
        }
        entries.push({ name: value.name, ...(id === undefined ? {} : { id }) });
      }
      for (const entry of entries) {
        if (entry.id === null) {
          paths.push(...(await listAvatarPaths(`${prefix}${entry.name}/`)));
        } else {
          paths.push(`${prefix}${entry.name}`);
        }
      }
      if (entries.length < STORAGE_PAGE_SIZE) return paths;
      offset += payload.length;
    }
  }

  return {
    async getCurrentUser(accessToken) {
      const response = await fetcher(`${baseUrl}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new AccountDeletionGatewayError("auth_unavailable");
      const payload = await jsonResponse(response);
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("id" in payload) ||
        !("email" in payload) ||
        typeof payload.id !== "string" ||
        typeof payload.email !== "string"
      ) {
        throw new AccountDeletionGatewayError("auth_unavailable");
      }
      return { id: payload.id, email: payload.email };
    },

    async verifyPassword(email, password, expectedUserId) {
      const response = await fetcher(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.status === 400 || response.status === 401 || response.status === 422) return false;
      if (!response.ok) throw new AccountDeletionGatewayError("auth_unavailable");
      const payload = await jsonResponse(response);
      return (
        typeof payload === "object" &&
        payload !== null &&
        "user" in payload &&
        typeof payload.user === "object" &&
        payload.user !== null &&
        "id" in payload.user &&
        payload.user.id === expectedUserId
      );
    },

    async purgeAvatars(userId) {
      const paths = await listAvatarPaths(`${userId}/`);
      for (let index = 0; index < paths.length; index += STORAGE_PAGE_SIZE) {
        const response = await fetcher(`${baseUrl}/storage/v1/object/${AVATAR_BUCKET}`, {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefixes: paths.slice(index, index + STORAGE_PAGE_SIZE) }),
        });
        if (!response.ok) throw new AccountDeletionGatewayError("storage_unavailable");
      }
      if ((await listAvatarPaths(`${userId}/`)).length > 0) {
        throw new AccountDeletionGatewayError("storage_unavailable");
      }
    },

    async hardDeleteUser(userId) {
      const response = await fetcher(
        `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=false`,
        {
          method: "DELETE",
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        },
      );
      if (response.ok) return;
      const payload = await jsonResponse(response);
      if (isNotFound(response, payload)) return;
      throw new AccountDeletionGatewayError("auth_unavailable");
    },
  };
}

async function finishExternalCleanup(
  env: Bindings,
  record: AccountDeletionRecord,
  repository: AccountDeletionRepository,
  gatewayFactory: (env: Bindings) => SupabaseDeletionGateway,
): Promise<AccountDeletionStatus> {
  try {
    const gateway = gatewayFactory(env);
    if (!record.storagePurgedAt) {
      await gateway.purgeAvatars(record.userId);
      await repository.markStoragePurged(env, record.userId);
    }
    if (!record.authDeletedAt) {
      await gateway.hardDeleteUser(record.userId);
      await repository.markAuthDeleted(env, record.userId);
    }
    return "deleted";
  } catch (error) {
    const code = error instanceof AccountDeletionGatewayError ? error.code : "auth_unavailable";
    await repository.releaseCleanup(env, record.userId, code);
    return "cleanup_pending";
  }
}

export function createAccountDeletionService(
  repository: AccountDeletionRepository = accountDeletionRepository,
  gatewayFactory: (env: Bindings) => SupabaseDeletionGateway = createSupabaseDeletionGatewayForEnvironment,
): AccountDeletionService {
  return {
    async deleteAccount({ env, user, accessToken, password }) {
      let record = await repository.find(env, user.id);
      if (!record) {
        const gateway = gatewayFactory(env);
        const currentUser = await gateway.getCurrentUser(accessToken);
        if (currentUser.id !== user.id) {
          throw new HttpError(401, "invalid_access_token", "Sign in again before deleting your account.");
        }
        const verified = await gateway.verifyPassword(currentUser.email, password, user.id);
        if (!verified) {
          throw new HttpError(400, "invalid_current_password", "The current password could not be verified.");
        }
        record = await repository.purgeTenant(env, user.id);
      }
      return finishExternalCleanup(env, record, repository, gatewayFactory);
    },

    async reconcile(env, limit) {
      const records = await repository.claimPendingCleanup(env, limit);
      let completed = 0;
      for (const record of records) {
        if ((await finishExternalCleanup(env, record, repository, gatewayFactory)) === "deleted") {
          completed += 1;
        }
      }
      return completed;
    },
  };
}
