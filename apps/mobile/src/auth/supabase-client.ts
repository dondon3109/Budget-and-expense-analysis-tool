import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, publicConfig } from "@/config/public-config";

import { secureSessionStorage } from "./secure-session-storage";

export const supabase: SupabaseClient | null =
  isSupabaseConfigured && publicConfig.supabaseUrl && publicConfig.supabasePublishableKey
    ? createClient(publicConfig.supabaseUrl, publicConfig.supabasePublishableKey, {
        auth: {
          storage: secureSessionStorage,
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
