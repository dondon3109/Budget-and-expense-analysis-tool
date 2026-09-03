import { describe, expect, it, vi } from "vitest";

import {
  createSharedBudgetPayload,
  decodeSharedBudgetToken,
  encodeSharedBudgetToken,
  maskSensitiveDetails,
  type SharedBudgetPayload,
} from "../src/sharedBudget";

describe("shared budget payload", () => {
  it("creates envelope and budget totals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00.000Z"));

    try {
      const payload = createSharedBudgetPayload({
        title: "September budget",
        month: "2026-09",
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            color: "#22c55e",
            allocatedLimitMinor: 10_000,
            spentMinor: 3_333,
          },
          {
            id: "dining",
            name: "Dining",
            allocatedLimitMinor: 5_000,
            spentMinor: 6_000,
          },
        ],
        ownerDisplayName: "Don",
        notes: "Shared snapshot",
        expiresInDays: 7,
      });

      expect(payload).toMatchObject({
        version: 1,
        title: "September budget",
        month: "2026-09",
        currency: "PHP",
        totalAllocatedMinor: 15_000,
        totalSpentMinor: 9_333,
        totalRemainingMinor: 5_667,
        totalPercentUsed: 62,
        ownerDisplayName: "Don",
        notes: "Shared snapshot",
        createdAt: "2026-09-03T12:00:00.000Z",
        expiresAt: "2026-09-10T12:00:00.000Z",
      });
      expect(payload.shareId).toMatch(/^[0-9a-f]{24}$/u);
      expect(payload.envelopes).toEqual([
        {
          categoryId: "groceries",
          categoryName: "Groceries",
          categoryColor: "#22c55e",
          allocatedLimitMinor: 10_000,
          spentMinor: 3_333,
          remainingMinor: 6_667,
          percentUsed: 33,
        },
        {
          categoryId: "dining",
          categoryName: "Dining",
          categoryColor: "#64748b",
          allocatedLimitMinor: 5_000,
          spentMinor: 6_000,
          remainingMinor: 0,
          percentUsed: 120,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses zero percent when allocated limits are zero", () => {
    const payload = createSharedBudgetPayload({
      title: "Zero budget",
      month: "2026-09",
      categories: [
        {
          id: "misc",
          name: "Misc",
          allocatedLimitMinor: 0,
          spentMinor: 500,
        },
      ],
    });

    expect(payload.envelopes[0]?.remainingMinor).toBe(0);
    expect(payload.envelopes[0]?.percentUsed).toBe(0);
    expect(payload.totalAllocatedMinor).toBe(0);
    expect(payload.totalSpentMinor).toBe(500);
    expect(payload.totalRemainingMinor).toBe(0);
    expect(payload.totalPercentUsed).toBe(0);
    expect(payload.expiresAt).toBeUndefined();
  });
});

describe("shared budget token", () => {
  const payload: SharedBudgetPayload = {
    version: 1,
    shareId: "share_123",
    title: "September budget",
    month: "2026-09",
    currency: "PHP",
    envelopes: [
      {
        categoryId: "groceries",
        categoryName: "Groceries",
        categoryColor: "#22c55e",
        allocatedLimitMinor: 10_000,
        spentMinor: 3_333,
        remainingMinor: 6_667,
        percentUsed: 33,
      },
    ],
    totalAllocatedMinor: 10_000,
    totalSpentMinor: 3_333,
    totalRemainingMinor: 6_667,
    totalPercentUsed: 33,
    createdAt: "2026-09-03T12:00:00.000Z",
    expiresAt: "2026-09-10T12:00:00.000Z",
  };

  it("round-trips through a base64url token", () => {
    const token = encodeSharedBudgetToken(payload);

    expect(token).toMatch(/^zsb1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/u);
    expect(decodeSharedBudgetToken(token, "2026-09-09T12:00:00.000Z")).toEqual({
      valid: true,
      payload,
    });
  });

  it("rejects expired tokens", () => {
    const token = encodeSharedBudgetToken(payload);

    expect(decodeSharedBudgetToken(token, "2026-09-10T12:00:00.001Z")).toEqual({
      valid: false,
      error: "expired",
    });
  });

  it("rejects malformed and tampered tokens", () => {
    const token = encodeSharedBudgetToken(payload);
    const tampered = token.replace(/.$/u, (character) => (character === "0" ? "1" : "0"));

    expect(decodeSharedBudgetToken("not-a-token")).toEqual({ valid: false, error: "malformed" });
    expect(decodeSharedBudgetToken(tampered)).toEqual({
      valid: false,
      error: "invalid_signature",
    });
  });

  it("rejects unsupported payload versions", () => {
    const token = encodeSharedBudgetToken({
      ...payload,
      version: 2,
    } as unknown as SharedBudgetPayload);

    expect(decodeSharedBudgetToken(token)).toEqual({
      valid: false,
      error: "unsupported_version",
    });
  });
});

describe("shared budget masking", () => {
  it("returns only the share summary fields", () => {
    const payload = {
      version: 1,
      shareId: "share_123",
      title: "September budget",
      month: "2026-09",
      currency: "PHP",
      envelopes: [
        {
          categoryId: "groceries",
          categoryName: "Groceries",
          categoryColor: "#22c55e",
          allocatedLimitMinor: 10_000,
          spentMinor: 3_333,
          remainingMinor: 6_667,
          percentUsed: 33,
          rawTransactions: [{ description: "Private purchase" }],
        },
      ],
      totalAllocatedMinor: 10_000,
      totalSpentMinor: 3_333,
      totalRemainingMinor: 6_667,
      totalPercentUsed: 33,
      ownerDisplayName: "Don",
      notes: "Private account note",
      createdAt: "2026-09-03T12:00:00.000Z",
      expiresAt: null,
      bankAccounts: [{ name: "Checking" }],
      rawTransactions: [{ description: "Private purchase" }],
    } as unknown as SharedBudgetPayload;

    const masked = maskSensitiveDetails(payload) as SharedBudgetPayload & Record<string, unknown>;

    expect(masked).toEqual({
      version: 1,
      shareId: "share_123",
      title: "September budget",
      month: "2026-09",
      currency: "PHP",
      envelopes: [
        {
          categoryId: "groceries",
          categoryName: "Groceries",
          categoryColor: "#22c55e",
          allocatedLimitMinor: 10_000,
          spentMinor: 3_333,
          remainingMinor: 6_667,
          percentUsed: 33,
        },
      ],
      totalAllocatedMinor: 10_000,
      totalSpentMinor: 3_333,
      totalRemainingMinor: 6_667,
      totalPercentUsed: 33,
      expiresAt: null,
      createdAt: "2026-09-03T12:00:00.000Z",
    });
    expect(masked.ownerDisplayName).toBeUndefined();
    expect(masked.notes).toBeUndefined();
    expect(masked.bankAccounts).toBeUndefined();
    expect(masked.rawTransactions).toBeUndefined();
    expect(masked.envelopes[0]).not.toHaveProperty("rawTransactions");
  });
});
