const SOCIAL_AUTH_DESTINATION_KEY = "zoption-social-auth-destination";

function safeDestination(value: string | null | undefined): string | null {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}

export function saveSocialAuthDestination(value: string | null | undefined): void {
  try {
    const destination = safeDestination(value);
    if (destination) sessionStorage.setItem(SOCIAL_AUTH_DESTINATION_KEY, destination);
    else sessionStorage.removeItem(SOCIAL_AUTH_DESTINATION_KEY);
  } catch {
    // Storage can be unavailable in hardened browsers. The callback safely falls back to /app.
  }
}

export function consumeSocialAuthDestination(): string | null {
  try {
    const destination = safeDestination(sessionStorage.getItem(SOCIAL_AUTH_DESTINATION_KEY));
    sessionStorage.removeItem(SOCIAL_AUTH_DESTINATION_KEY);
    return destination;
  } catch {
    return null;
  }
}
