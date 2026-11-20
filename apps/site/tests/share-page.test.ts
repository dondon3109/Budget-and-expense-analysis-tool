import { describe, expect, it } from "vitest";

import {
  formatCheckedAt,
  formatShareMoney,
  parsePublicShare,
  tokenFromHash,
} from "../src/lib/share";

const transaction = {
  kind: "transaction",
  direction: "expense",
  amountMinor: 25000,
  currency: "PHP",
  description: null,
  categoryName: "Food",
  date: "2026-10-15",
  note: null,
};

describe("share page data", () => {
  it("reads only a well-formed token from the fragment", () => {
    expect(tokenFromHash("#x7Kp_QeR-2mN8vLs4aBcDe")).toBe("x7Kp_QeR-2mN8vLs4aBcDe");
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#short")).toBeNull();
    expect(tokenFromHash("#x7Kp_QeR-2mN8vLs4aBcDe&next=/x")).toBeNull();
  });

  it("accepts the public payload and rejects anything shaped differently", () => {
    const payload = { snapshot: transaction, sharerName: null, createdAt: "x", expiresAt: null };
    expect(parsePublicShare(payload)).toEqual({
      snapshot: transaction,
      live: null,
      sharerName: null,
      expiresAt: null,
    });
    expect(parsePublicShare({ ...payload, snapshot: { ...transaction, amountMinor: 1.5 } })).toBe(
      null,
    );
    expect(parsePublicShare({ ...payload, snapshot: { ...transaction, kind: "account" } })).toBe(
      null,
    );
    expect(parsePublicShare(null)).toBeNull();
  });

  it("reads a live balance and rejects a malformed one", () => {
    const balance = { kind: "balance", amountMinor: 275000, currency: "PHP", asOf: "2026-11-20" };
    const live = { amountMinor: 300000, currency: "PHP", checkedAt: "2026-11-20T07:00:00.000Z" };
    const payload = { snapshot: balance, live, sharerName: null, createdAt: "x", expiresAt: null };
    expect(parsePublicShare(payload)?.live).toEqual(live);
    expect(parsePublicShare({ ...payload, live: { ...live, amountMinor: 1.5 } })).toBeNull();
  });

  it("shows the live balance's time, with the date once it is not today", () => {
    const now = new Date(2026, 10, 20, 15, 30);
    expect(formatCheckedAt(new Date(2026, 10, 20, 15, 4).toISOString(), now)).toMatch(/3:04/u);
    expect(formatCheckedAt(new Date(2026, 10, 19, 15, 4).toISOString(), now)).toMatch(/2026/u);
  });

  it("prints whole units, as the app does", () => {
    expect(formatShareMoney(16960925, "PHP")).toBe("₱169,609");
  });
});
