import { describe, expect, it } from "vitest";

import { currentRelease, releaseHistory } from "../src/releases/currentRelease";

describe("current release notes", () => {
  it("highlights category emojis, mobile transaction ledger, and Android Beta", () => {
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Category emojis across web and mobile",
      "Redesigned mobile transaction ledger",
      "Android Beta 0.2.12",
      "Focused budget limits",
    ]);

    const notes = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(notes).toMatch(/category emojis/i);
    expect(notes).toMatch(/transaction ledger/i);
    expect(notes).toMatch(/Android Beta/i);
    expect(notes).toMatch(/budget limits/i);
  });

  it("keeps the touch-first cash flow and voice states as 2.2.1 release history", () => {
    const mobileRelease = releaseHistory[1];
    expect(mobileRelease?.version).toBe("2.2.1");
    expect(mobileRelease?.changes.map((change) => change.title)).toEqual([
      "Cash flow chart built for your phone",
      "Recording now looks like recording",
    ]);

    const notes =
      mobileRelease?.changes.map((change) => `${change.title} ${change.description}`).join(" ") ??
      "";
    expect(notes).toMatch(/touch-first chart/i);
    expect(notes).toMatch(/drag to scrub/i);
    expect(notes).toMatch(/pulsing red recording state/i);
    expect(notes).toMatch(/separate spinner/i);
  });

  it("keeps review-first receipt scanning as 2.2.0 release history", () => {
    const receiptRelease = releaseHistory[2];
    expect(receiptRelease?.version).toBe("2.2.0");
    expect(receiptRelease?.changes.map((change) => change.title)).toEqual([
      "Turn a receipt photo into a transaction draft",
      "Review every field before saving",
      "Receipt photos are never stored",
    ]);

    const notes =
      receiptRelease?.changes
        .map((change) => `${change.title} ${change.description}`)
        .join(" ") ?? "";
    expect(notes).toMatch(/scan receipt/i);
    expect(notes).toMatch(/merchant, date, amount, transaction type, and category/i);
    expect(notes).toMatch(/nothing is added.+until you explicitly commit/i);
    expect(notes).toMatch(/photo.+discarded immediately/i);
  });

  it("keeps the assistant voice implementation as 2.1.0 release history", () => {
    const voiceRelease = releaseHistory[3];
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
