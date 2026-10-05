import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// The signing key is the one secret that can never be rotated, so where the Android workflows may
// read it is pinned here rather than left to review.
async function jobs() {
  const text = await readFile(".github/workflows/android-beta.yml", "utf8");
  const start = (name) => text.indexOf(`\n  ${name}:`);
  const slice = (from, to) => text.slice(start(from), to ? start(to) : undefined);
  return {
    text,
    plan: slice("plan", "release"),
    release: slice("release", "snapshot"),
    snapshot: slice("snapshot", "notify"),
    notify: slice("notify"),
  };
}

describe("Android Beta workflows", () => {
  it("reads the signing key and R2 credentials only in the approved release job", async () => {
    const { text, release } = await jobs();
    for (const name of [
      "ANDROID_KEYSTORE_BASE64",
      "ANDROID_KEY_PASSWORD",
      "R2_SECRET_ACCESS_KEY",
    ]) {
      expect(release).toContain(`secrets.${name}`);
      expect(text.split(`secrets.${name}`).length - 1).toBe(
        release.split(`secrets.${name}`).length - 1,
      );
    }
    expect(release).toMatch(/^ {4}environment: android-beta$/m);
  });

  it("keeps the ungated jobs free of secrets", async () => {
    const { plan, snapshot } = await jobs();
    expect(plan).not.toMatch(/secrets\./);
    expect(snapshot).not.toMatch(/secrets\./);
  });

  it("never retains the signed APK as a workflow artifact", async () => {
    const { text } = await jobs();
    expect(text).not.toMatch(/upload-artifact/);
  });

  it("waits for the same approval before moving the channel back", async () => {
    const rollback = await readFile(".github/workflows/android-rollback.yml", "utf8");
    expect(rollback).toMatch(/^ {4}environment: android-beta$/m);
    expect(rollback).not.toMatch(/ANDROID_KEY/);
  });
});
