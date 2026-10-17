import { describe, expect, it } from "vitest";

import { formatShareMoney, parsePublicShare, tokenFromHash } from "../src/lib/share";

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

  it("prints whole units, as the app does", () => {
    expect(formatShareMoney(16960925, "PHP")).toBe("₱169,609");
  });
});
