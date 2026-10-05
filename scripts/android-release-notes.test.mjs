import { describe, expect, it } from "vitest";

import { releaseNotesFromChanges } from "./android-release-notes.mjs";

const change = (title) => ({ title, description: "…" });

describe("android release notes", () => {
  it("keeps headline changes and drops the fixes roll-up and the APK's own entry", () => {
    expect(
      releaseNotesFromChanges([
        change("A Calendar tab on Android and iOS"),
        change("Fixes"),
        change("Android Beta 0.2.46"),
        change("A cleaner Goals page on mobile"),
      ]),
    ).toEqual(["A Calendar tab on Android and iOS", "A cleaner Goals page on mobile"]);
  });

  it("caps the list so latest.json stays short", () => {
    const many = Array.from({ length: 10 }, (_, index) => change(`Change ${index}`));
    expect(releaseNotesFromChanges(many)).toHaveLength(6);
  });
});
