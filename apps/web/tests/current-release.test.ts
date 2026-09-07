import { describe, expect, it } from "vitest";

import { currentRelease, releaseHistory } from "../src/releases/currentRelease";

describe("current release notes", () => {
  it("highlights voice entry, SMS quick-paste, mic widget, CSV import, and Android Beta", () => {
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Fast-path voice transaction entry",
      "Smart SMS notification quick-paste",
      "Native Android home-screen mic widget",
      "Day-1 CSV import and offline privacy mode",
      "Android Beta 0.2.22",
    ]);

    const notes = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(notes).toMatch(/voice transaction entry/i);
    expect(notes).toMatch(/SMS notification/i);
    expect(notes).toMatch(/mic widget/i);
    expect(notes).toMatch(/CSV import/i);
    expect(notes).toMatch(/Android Beta/i);
  });

  it("keeps the renewal calendar and 0.2.20 beta as 2.27.0 release history", () => {
    const prevRelease = releaseHistory[1];
    expect(prevRelease?.version).toBe("2.27.0");
    expect(prevRelease?.changes.map((change) => change.title)).toEqual([
      "Visual Renewal Calendar for Subscriptions",
      "Category emojis across web and mobile",
      "Redesigned mobile transaction ledger",
      "Android Beta 0.2.20",
      "Focused budget limits",
    ]);
  });

  it("keeps the touch-first cash flow and voice states as 2.2.1 release history", () => {
    const mobileRelease = releaseHistory[2];
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
    const receiptRelease = releaseHistory[3];
    expect(receiptRelease?.version).toBe("2.2.0");
    expect(receiptRelease?.changes.map((change) => change.title)).toEqual([
      "Turn a receipt photo into a transaction draft",
      "Review every field before saving",
      "Receipt photos are never stored",
    ]);

    const notes =
      receiptRelease?.changes.map((change) => `${change.title} ${change.description}`).join(" ") ??
      "";
    expect(notes).toMatch(/scan receipt/i);
    expect(notes).toMatch(/merchant, date, amount, transaction type, and category/i);
    expect(notes).toMatch(/nothing is added.+until you explicitly commit/i);
    expect(notes).toMatch(/photo.+discarded immediately/i);
  });

  it("keeps the assistant voice implementation as 2.1.0 release history", () => {
    const voiceRelease = releaseHistory[4];
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
