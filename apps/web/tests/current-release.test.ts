import { describe, expect, it } from "vitest";

import { currentRelease } from "../src/releases/currentRelease";

describe("current release notes", () => {
  it("highlights the assistant voice implementation for version 2.1.0", () => {
    expect(currentRelease.version).toBe("2.1.0");
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Talk naturally with your Financial Assistant",
      "Recording stops when you finish",
      "Choose how voice works for you",
      "Clearer spoken answers",
      "A more capable, easier-to-reach Zoption",
    ]);

    const notes = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(notes).toMatch(/voice recordings are transcribed/i);
    expect(notes).toMatch(/stops recording after you finish/i);
    expect(notes).toMatch(/automatic sending and spoken plus text replies in Production/i);
    expect(notes).toMatch(/transcript review or text-only answers/i);
    expect(notes).toMatch(/more natural speech/i);
  });
});
