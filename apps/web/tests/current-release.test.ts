import { describe, expect, it } from "vitest";

import { currentRelease, releaseHistory } from "../src/releases/currentRelease";

describe("current release notes", () => {
  it("highlights the Android status bar fix for version 2.1.1", () => {
    expect(currentRelease.version).toBe("2.1.1");
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Android status bar restored",
    ]);

    const notes = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(notes).toMatch(/status bar/i);
    expect(notes).toMatch(/time, Wi-Fi, and battery indicators/i);
    expect(notes).toMatch(/no longer opens in immersive fullscreen/i);
    expect(notes).toMatch(/already using the app\? download the updated apk/i);
  });

  it("keeps the assistant voice implementation as 2.1.0 release history", () => {
    const voiceRelease = releaseHistory[1];
    expect(voiceRelease?.version).toBe("2.1.0");
    expect(voiceRelease?.changes.map((change) => change.title)).toEqual([
      "Talk naturally with your Financial Assistant",
      "Recording stops when you finish",
      "Choose how voice works for you",
      "Clearer spoken answers",
      "A more capable, easier-to-reach Zoption",
    ]);
  });
});
