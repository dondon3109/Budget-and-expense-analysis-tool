import { describe, expect, it } from "vitest";

import { currentRelease, releaseHistory } from "../src/releases/currentRelease";

describe("current release notes", () => {
  it("highlights review-first receipt scanning for version 2.2.0", () => {
    expect(currentRelease.version).toBe("2.2.0");
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Turn a receipt photo into a transaction draft",
      "Review every field before saving",
      "Receipt photos are never stored",
    ]);

    const notes = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(notes).toMatch(/scan receipt/i);
    expect(notes).toMatch(/merchant, date, amount, transaction type, and category/i);
    expect(notes).toMatch(/nothing is added.+until you explicitly commit/i);
    expect(notes).toMatch(/photo.+discarded immediately/i);
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
