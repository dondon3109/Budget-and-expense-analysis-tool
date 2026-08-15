/**
 * Parses the URL an OAuth provider redirects to when the system auth session
 * completes. Supabase returns either a PKCE code (?code=...) or an error
 * (?error=...&error_description=...). The query may be split off with "?"
 * or, for implicit-style responses, "#".
 */
export type OAuthCallbackParams = { code: string } | { error: string };

export function parseOAuthCallbackUrl(url: string): OAuthCallbackParams | null {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const candidates = [hashIndex, queryIndex].filter((index) => index !== -1);
  if (candidates.length === 0) return null;
  const separator = Math.min(...candidates);
  const params = new URLSearchParams(url.slice(separator + 1));
  const code = params.get("code");
  if (code) return { code };
  const error = params.get("error");
  if (error) return { error: params.get("error_description") ?? error };
  return null;
}
