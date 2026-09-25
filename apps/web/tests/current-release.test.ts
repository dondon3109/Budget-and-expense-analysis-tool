import { describe, expect, it } from "vitest";

import { currentRelease, releaseHistory } from "../src/releases/currentRelease";

/**
 * Looked up by version rather than array position: a new release shifts every
 * index, and a silently wrong index would assert the wrong notes. The leading
 * entry is the live release, which the first test covers.
 *
 * Version-to-tag accuracy is covered for every entry by
 * release-note-provenance.test.ts, so these tests pin the copy that users read.
 */
function release(version: string) {
  const found = releaseHistory.slice(1).find((entry) => entry.version === version);
  if (!found) throw new Error(`releaseHistory has no ${version} entry`);
  return found;
}

const titles = (version: string) => release(version).changes.map((change) => change.title);
const notes = (version: string) =>
  release(version)
    .changes.map((change) => `${change.title} ${change.description}`)
    .join(" ");

describe("current release notes", () => {
  it("lists only what the running version shipped", () => {
    expect(currentRelease.changes.map((change) => change.title)).toEqual([
      "Choose a default spending account",
      "Reactivating a subscription charges only what is due",
      "Steadier Android help and budgets",
      "A Sync delayed notice you can close",
      "Two clear ways to pay for Pro on the web",
      "New Philippine budgeting guides",
      "Android Beta 0.2.36",
    ]);

    const copy = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(copy).toMatch(/instead of Cash/i);
    expect(copy).toMatch(/Android Beta 0\.2\.36/);
  });

  it("keeps the Dodo Payments, app lock, and mic widget income notes as 2.44.0", () => {
    expect(titles("2.44.0")).toEqual([
      "Pay for Zoption Pro with Dodo Payments",
      "An optional app lock on Android",
      "Open offline without signing in again",
      "Speak your income into the Android mic widget",
      "A new look on the web and in the app",
      "Android Beta 0.2.35",
    ]);

    const copy = notes("2.44.0");
    expect(copy).toMatch(/merchant of record/i);
    expect(copy).toMatch(/Android Beta 0\.2\.35/);
  });

  it("keeps the debt payment and edit notes as 2.43.1", () => {
    expect(titles("2.43.1")).toEqual([
      "Debt payments that pay down the debt",
      "Edits that stay edits",
      "Categories without a limit stay out of your budget",
      "Steadier loading on a slow connection",
      "A clearer debt form",
    ]);
    expect(notes("2.43.1")).toMatch(/lowers that debt's balance/i);
  });

  it("keeps the splash, safe-to-spend, and forecast notes as 2.41.3", () => {
    expect(titles("2.41.3")).toEqual([
      "A startup screen that no longer flickers",
      "A faster welcome into your workspace",
      "Safe-to-spend guidance on the web dashboard",
      "A cash-flow forecast that shows its shape",
      "Dashboard shortcuts to the forecast and the remittance calculator",
      "Honest amounts in the remittance calculator",
      "Android Beta 0.2.33",
    ]);

    const copy = notes("2.41.3");
    expect(copy).toMatch(/a single handover rather than a flash/i);
    expect(copy).toMatch(/safely spend this week/i);
    expect(copy).toMatch(/Android Beta 0\.2\.33/);
  });

  it("lists each shipped version once, newest first", () => {
    expect(releaseHistory.slice(1).map((entry) => entry.version)).toEqual([
      "2.44.0",
      "2.43.1",
      "2.41.3",
      "2.39.0",
      "2.38.0",
      "2.33.0",
      "2.32.4",
      "2.32.0",
      "2.30.1",
      "2.30.0",
      "2.29.0",
      "2.18.0",
      "2.2.1",
      "2.1.0",
      "2.0.0",
    ]);
  });

  it("keeps assistant memory and the rebuilt Memory panel as 2.39.0", () => {
    expect(titles("2.39.0")).toEqual([
      "Assistant memory that stays until you delete it",
      "A rebuilt Memory & Preferences panel",
      "A question that spans several records is answered from them",
      "Android Beta 0.2.32",
    ]);

    const copy = notes("2.39.0");
    expect(copy).toMatch(/kept until you delete a fact, clear memory/i);
    expect(copy).toMatch(/Clear memory action in place while the list scrolls/i);
    expect(copy).toMatch(/Android Beta 0\.2\.32/);
  });

  it("keeps the shared AI allowance, reversed payments, and Android sign-out as 2.38.0", () => {
    expect(titles("2.38.0")).toEqual([
      "One shared AI allowance for every AI feature",
      "Reversed payments now end Pro",
      "Signing out on Android ends the session on the server",
      "Steadier assistant amounts, savings interest, and profile photos",
      "Android Beta 0.2.31",
    ]);

    const copy = notes("2.38.0");
    expect(copy).toMatch(/500 actions on Free/i);
    expect(copy).toMatch(/2,000 on Pro/i);
    expect(copy).toMatch(/chargeback/i);
    expect(copy).toMatch(/revokes the session/i);
    expect(copy).toMatch(/Android Beta 0\.2\.31/);
  });

  it("keeps the cross-chat memory batch as 2.33.0", () => {
    expect(titles("2.33.0")).toEqual([
      "Cross-chat assistant memory and editor",
      "Mobile navigation and UI ergonomics",
      "Monthly transaction Net totals",
      "Mobile cookie consent banner fix",
      "Android Beta 0.2.29",
    ]);

    const copy = notes("2.33.0");
    expect(copy).toMatch(/assistant memory/i);
    expect(copy).toMatch(/navigation/i);
    expect(copy).toMatch(/cookie consent/i);
  });

  it("rolls the pre-2.0 releases into the 2.0.0 tag that carries them", () => {
    // Those versions reached users before the repository kept a tag per release,
    // so 2.0.0 is the first release that can be verified from git.
    expect(titles("2.0.0").length).toBeGreaterThan(20);
    expect(titles("2.0.0")).toContain("A smoother welcome to your workspace");
    expect(titles("2.0.0")).toContain("US dollar transactions");

    const copy = notes("2.0.0");
    expect(copy).toMatch(/one polished loading experience/i);
  });

  it("keeps the cash flow chart and receipt scanning together in 2.2.1", () => {
    expect(titles("2.2.1")).toEqual([
      "Cash flow chart built for your phone",
      "Recording now looks like recording",
      "Turn a receipt photo into a transaction draft",
      "Review every field before saving",
      "Receipt photos are never stored",
    ]);

    const copy = notes("2.2.1");
    expect(copy).toMatch(/touch-first chart/i);
    expect(copy).toMatch(/pulsing red recording state/i);
    expect(copy).toMatch(/discarded immediately after extraction/i);
  });
});
