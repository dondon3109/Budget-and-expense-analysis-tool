import Constants from "expo-constants";

export type AppVariant = "development" | "preview" | "production";

/** Demo-only capabilities fail closed unless the embedded variant is explicitly development. */
export function isDevelopmentAppVariant(
  extra: unknown = Constants.expoConfig?.extra,
): boolean {
  return (
    typeof extra === "object" &&
    extra !== null &&
    "appVariant" in extra &&
    (extra as { appVariant?: unknown }).appVariant === "development"
  );
}

export function assertDevelopmentAppVariant(extra?: unknown): void {
  if (!isDevelopmentAppVariant(extra)) {
    throw new Error("Demo data is available only in Zoption Dev.");
  }
}
