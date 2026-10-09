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
      "Several purchases in one message",
      "Updated assistant consent",
      "A calmer Home and Analytics",
      "A tidier assistant on Android and iOS",
      "Fixes",
      "Android Beta 0.2.50",
    ]);

    const copy = currentRelease.changes
      .map((change) => `${change.title} ${change.description}`)
      .join(" ");
    expect(copy).toMatch(/several purchases/i);
    expect(copy).toMatch(/Android Beta 0\.2\.50/);
  });

  it("keeps the compact layout and guides notes as 3.7.0", () => {
    expect(titles("3.7.0")).toContain("A more compact mobile app");
    expect(notes("3.7.0")).toMatch(/Android Beta 0\.2\.47/);
  });

  it("keeps the assistant, calendar, and goals notes as 3.6.0", () => {
    expect(titles("3.6.0")).toContain("A Calendar tab on Android and iOS");
    expect(notes("3.6.0")).toMatch(/Android Beta 0\.2\.46/);
  });

  it("keeps the 3.4.0 currency and account type notes", () => {
    expect(titles("3.4.0")).toContain("More currencies");
    expect(notes("3.4.0")).toMatch(/Android Beta 0\.2\.45/);
  });

  it("keeps the no-account and goal question notes as 3.3.0", () => {
    expect(titles("3.3.0")).toContain("Use Zoption on mobile without an account");
    expect(notes("3.3.0")).toMatch(/Android Beta 0\.2\.44/);
  });

  it("keeps the assistant transaction drafts and mic widget notes as 3.1.0", () => {
    expect(titles("3.1.0")).toEqual([
      "Log a transaction by chatting with the assistant",
      "Log several entries from the Android mic widget",
      "A new look for the Android mic widget",
      "A clearer Home screen on Android and iOS",
      "Start a fresh assistant conversation",
      "Money in and out opens monthly for Pro",
      "Daily reminder on by default on Android and iOS",
      "Assistant answers keep to your workspace currency",
      "Smoother sign-in links and a steadier PIN pad",
      "Android Beta 0.2.43",
    ]);

    const copy = notes("3.1.0");
    expect(copy).toMatch(/Nothing is saved until you tap Save transaction/i);
    expect(copy).toMatch(/Android Beta 0\.2\.43/);
  });

  it("keeps the app.zoption.site move notes as 3.0.0", () => {
    expect(titles("3.0.0")).toEqual([
      "Your workspace moved to app.zoption.site",
      "Faster public pages",
      "A short setup for new workspaces",
      "Checkout leads with Dodo Payments",
      "Currency moved to Preferences on Android and iOS",
      "Tidier account rows and settings menus",
      "Android Beta 0.2.42",
    ]);

    const copy = notes("3.0.0");
    expect(copy).toMatch(/opening balance/i);
    expect(copy).toMatch(/Android Beta 0\.2\.42/);
    expect(copy).toMatch(/sign in once more/i);
  });

  it("keeps the workspace currency notes as 2.49.0", () => {
    expect(titles("2.49.0")).toEqual([
      "Choose your workspace currency",
      "Subscriptions bill in their own currency",
      "Dollar accounts and renewal emails use the right currency",
      "Currency stays separate per person and per chart",
      "Android Beta 0.2.40",
    ]);

    const copy = notes("2.49.0");
    expect(copy).toMatch(/Philippine Peso or US Dollar/i);
    expect(copy).toMatch(/Android Beta 0\.2\.40/);
  });

  it("keeps the Uncategorized default and balance card notes as 2.48.0", () => {
    expect(titles("2.48.0")).toEqual([
      "New transactions start on Uncategorized",
      "The default-account star stays on the card",
      "Android Beta 0.2.39",
    ]);

    const copy = notes("2.48.0");
    expect(copy).toMatch(/Uncategorized category/i);
    expect(copy).toMatch(/Android Beta 0\.2\.39/);
  });

  it("keeps the daily reminder and new logo notes as 2.47.0", () => {
    expect(titles("2.47.0")).toEqual([
      "A daily reminder on Android and iOS",
      "A new Zoption logo",
      "Balances keep their minus sign",
      "Exact amounts in more places",
      "Imports update balances right away",
      "Budgets for removed categories",
      "Android Beta 0.2.38",
    ]);

    const copy = notes("2.47.0");
    expect(copy).toMatch(/signing out turns it off/i);
    expect(copy).toMatch(/Android Beta 0\.2\.38/);
  });

  it("keeps the Pro trial, PIN lock, and itemized receipt notes as 2.46.0", () => {
    expect(titles("2.46.0")).toEqual([
      "Try Zoption Pro free for 7 days",
      "Create a category while adding a transaction",
      "A 6-digit PIN for the Android app lock",
      "Transactions grouped by day on the web",
      "Itemized receipts, discounts included",
      "A clearer Home screen on Android",
      "Quick Paste reads more SMS alerts",
      "A new loading animation",
      "Android Beta 0.2.37",
    ]);

    const copy = notes("2.46.0");
    expect(copy).toMatch(/no card or payment setup/i);
    expect(copy).toMatch(/Android Beta 0\.2\.37/);
  });

  it("keeps the default spending account notes as 2.45.0", () => {
    expect(titles("2.45.0")).toEqual([
      "Choose a default spending account",
      "Reactivating a subscription charges only what is due",
      "Steadier Android help and budgets",
      "A Sync delayed notice you can close",
      "Two clear ways to pay for Pro on the web",
      "New Philippine budgeting guides",
      "Android Beta 0.2.36",
    ]);

    const copy = notes("2.45.0");
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
      "3.7.0",
      "3.6.0",
      "3.4.0",
      "3.3.0",
      "3.1.0",
      "3.0.0",
      "2.49.0",
      "2.48.0",
      "2.47.0",
      "2.46.0",
      "2.45.0",
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
