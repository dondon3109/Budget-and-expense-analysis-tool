/**
 * The signed-in web app lives on its own origin. Every sign-in, sign-up, and
 * workspace link on the public site goes through here so a preview build can
 * point at a preview app.
 */
export const APP_ORIGIN = (import.meta.env.PUBLIC_APP_URL ?? "https://app.zoption.site").replace(
  /\/$/,
  "",
);

export function appUrl(path: `/${string}`): string {
  return `${APP_ORIGIN}${path}`;
}

/** Spread onto sign-in and sign-up links so the public page stays open behind the app. */
export const NEW_TAB = { target: "_blank", rel: "noopener" } as const;
