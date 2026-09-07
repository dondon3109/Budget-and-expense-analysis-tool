import {
  parseWidgetIntentPayload,
  parseWidgetTranscriptToIntent,
  resolveWidgetAccount,
  resolveWidgetCategory,
} from "./widget-intent";

describe("parseWidgetIntentPayload", () => {
  it("routes an expense payload", () => {
    const result = parseWidgetIntentPayload(
      JSON.stringify({
        type: "expense",
        amountMinor: 25000,
        merchant: "Jollibee",
        category: "Food",
        account: "Cash",
      }),
    );
    expect(result).toEqual({
      ok: true,
      intent: {
        type: "expense",
        amountMinor: 25000,
        merchant: "Jollibee",
        category: "Food",
        account: "Cash",
      },
    });
  });

  it("routes a reconcile payload", () => {
    const result = parseWidgetIntentPayload(
      JSON.stringify({
        type: "reconcile",
        account: "BDO",
        newBalanceMinor: 500000,
      }),
    );
    expect(result).toEqual({
      ok: true,
      intent: { type: "reconcile", account: "BDO", newBalanceMinor: 500000 },
    });
  });

  it("rejects garbage payloads", () => {
    for (const garbage of [
      "not json at all",
      JSON.stringify({ type: "unknown", amountMinor: 100 }),
      JSON.stringify({ type: "expense", amountMinor: -50, merchant: "X" }),
      JSON.stringify({ type: "expense", amountMinor: 0, merchant: "X" }),
      JSON.stringify({ type: "expense", amountMinor: 25.5, merchant: "X" }),
      JSON.stringify({ type: "expense", merchant: "Missing amount" }),
      JSON.stringify({ type: "reconcile", account: "", newBalanceMinor: 100 }),
      JSON.stringify({ type: "reconcile", newBalanceMinor: 100 }),
      JSON.stringify(null),
      "",
    ]) {
      expect(parseWidgetIntentPayload(garbage).ok).toBe(false);
    }
  });
});

describe("parseWidgetTranscriptToIntent", () => {
  it("parses an expense transcript", () => {
    expect(parseWidgetTranscriptToIntent("Spent 250 pesos on lunch")).toEqual({
      type: "expense",
      amountMinor: 25000,
      merchant: "on lunch",
    });
  });

  it("parses a reconcile transcript", () => {
    expect(parseWidgetTranscriptToIntent("Reconcile my BDO account to 5000 pesos")).toEqual({
      type: "reconcile",
      account: "BDO",
      newBalanceMinor: 500000,
    });
  });

  it("rejects transcripts without a currency-marked amount", () => {
    expect(parseWidgetTranscriptToIntent("hello world")).toBeNull();
    expect(parseWidgetTranscriptToIntent("lunch on march 5")).toBeNull();
    expect(parseWidgetTranscriptToIntent("   ")).toBeNull();
  });
});

describe("widget resolvers", () => {
  const accounts = [
    { id: "a-cash", name: "Cash" },
    { id: "a-bdo", name: "BDO" },
  ];
  const categories = [
    { id: "c-food", name: "Food", kind: "expense" as const },
    { id: "c-uncat", name: "Uncategorized", kind: "expense" as const },
  ];

  it("matches accounts case-insensitively and misses unknown names", () => {
    expect(resolveWidgetAccount(accounts, "bdo")).toBe("a-bdo");
    expect(resolveWidgetAccount(accounts, "Nope")).toBeNull();
    expect(resolveWidgetAccount(accounts, undefined)).toBeNull();
  });

  it("falls back to Uncategorized, then the first of its kind", () => {
    expect(resolveWidgetCategory(categories, "expense", "Food")).toBe("c-food");
    expect(resolveWidgetCategory(categories, "expense", "Nope")).toBe("c-uncat");
    expect(resolveWidgetCategory(categories, "income")).toBeNull();
  });
});
