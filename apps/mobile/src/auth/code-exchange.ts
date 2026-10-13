import { getSupabaseClient } from "./supabase-client";

async function exchangeCode(code: string) {
  const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data;
}

export type CodeExchange = Awaited<ReturnType<typeof exchangeCode>>;

// On Android a Google sign-in returns its callback twice: to openAuthSessionAsync and as a deep
// link to /auth/callback. A PKCE code can be exchanged only once, so the later caller used to get
// "invalid flow state". Codes are single use, so keeping each settled exchange is safe.
const exchanges = new Map<string, Promise<CodeExchange>>();

/** Exchanges an auth code for a session; every caller with the same code shares the first try. */
export function exchangeCodeOnce(code: string): Promise<CodeExchange> {
  let exchange = exchanges.get(code);
  if (!exchange) {
    exchange = exchangeCode(code);
    exchanges.set(code, exchange);
  }
  return exchange;
}
