import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSupabaseConfigured, publicConfig } from "@/config/public-config";

import { secureSessionStorage } from "./secure-session-storage";

// supabase-js's own default key, named here so an offline start can read the
// stored session back. Changing it would orphan every stored session.
const authStorageKey = publicConfig.supabaseUrl
  ? `sb-${new URL(publicConfig.supabaseUrl).hostname.split(".")[0]}-auth-token`
  : null;

export const supabase: SupabaseClient | null =
  isSupabaseConfigured &&
  publicConfig.supabaseUrl &&
  publicConfig.supabasePublishableKey &&
  authStorageKey
    ? createClient(publicConfig.supabaseUrl, publicConfig.supabasePublishableKey, {
        auth: {
          storage: secureSessionStorage,
          storageKey: authStorageKey,
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Authentication is not configured in this development build. Add the mobile Supabase public URL and publishable key, then restart the development server.",
    );
  }
  return supabase;
}

const storedSessionSchema = z.object({
  refresh_token: z.string().min(1),
  user: z.object({ id: z.string().uuid() }),
});

/**
 * The subject of the session auth-js keeps in storage, without refreshing it.
 * auth-js keeps that session when a refresh fails for network reasons, so it
 * still names who is signed in on this device while offline.
 */
export async function readStoredSessionSubject(): Promise<string | null> {
  if (!authStorageKey) return null;
  const raw = await secureSessionStorage.getItem(authStorageKey);
  if (!raw) return null;
  try {
    const result = storedSessionSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.user.id : null;
  } catch {
    return null;
  }
}
