/**
 * Refusal for an `.env.e2e` that loaded but left the credentials unusable, or null when they are
 * usable or no file was loaded at all (the CI case, which has no `.env.e2e`).
 *
 * A malformed line such as "E2E_EMAIL audit@example.com" parses without complaint and sets
 * nothing, so a file that exists is no proof it configured anything. What counts is the effective
 * value in `env` after the load, and an unusable one fails here rather than letting the
 * authenticated half of the e2e suite skip behind a green run.
 *
 * Read the values exactly as e2e/fixtures/authenticated.ts reads them, or this guard would accept
 * a value the fixtures then treat as absent: an email is trimmed, so a quoted blank counts as
 * unset, while a password is taken as written.
 */
export function e2eEnvGuardError(
  envFileLoaded: boolean,
  env: Record<string, string | undefined>,
): string | null {
  if (!envFileLoaded) return null;

  const unset = (key: string) => {
    const value = env[key];
    return key.endsWith("EMAIL") ? !value?.trim() : !value;
  };

  const missingRequired = ["E2E_EMAIL", "E2E_PASSWORD"].filter(unset);
  if (missingRequired.length > 0) {
    return (
      `.env.e2e is present but leaves ${missingRequired.join(" and ")} unset, so the authenticated ` +
      `half of the suite would skip and a green run would mean nothing. Set each missing key as ` +
      `KEY=value in that file, export the value in the environment, or delete the file.`
    );
  }

  // The empty-workspace pair is optional — those checks skip when it is unset — but a half pair
  // can never sign in, so it is refused rather than silently skipped.
  const missingOptional = ["E2E_EMPTY_EMAIL", "E2E_EMPTY_PASSWORD"].filter(unset);
  if (missingOptional.length === 1) {
    return (
      `.env.e2e sets one of E2E_EMPTY_EMAIL and E2E_EMPTY_PASSWORD but leaves ` +
      `${missingOptional[0]} unset. Those checks skip when the pair is absent, so set ` +
      `${missingOptional[0]} too or remove the other key.`
    );
  }

  return null;
}
