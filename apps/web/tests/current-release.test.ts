import { describe, expect, it } from "vitest";

import { currentRelease } from "../src/releases/currentRelease";

describe("current release notes", () => {
  it("lists the major Android and mobile changes for version 2.0.0", () => {
    expect(currentRelease.version).toBe("2.0.0");
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Zoption for Android",
      "A trustworthy installation guide",
      "Installable, without weakening privacy",
      "More room on mobile",
      "Profile scrolling restored",
    ]);

    const notes = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(notes).toMatch(/release-signed.*APK/i);
    expect(notes).toMatch(/checksum/i);
    expect(notes).toMatch(/offline caches/i);
    expect(notes).toMatch(/Assistant history/i);
    expect(notes).toMatch(/Profile dashboard remains scrollable/i);
  });
});
