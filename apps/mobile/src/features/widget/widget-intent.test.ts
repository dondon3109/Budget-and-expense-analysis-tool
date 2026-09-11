import {
  parseWidgetIntentPayload,
  parseWidgetTranscriptToIntent,
  resolveKnownBalanceMinor,
  resolveWidgetAccount,
  resolveWidgetAccountFromTranscript,
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

  const walletAccounts = [
    { id: "a-cash", name: "Cash" },
    { id: "a-gcash", name: "GCash" },
    { id: "a-gcash-wallet", name: "GCash Wallet" },
  ];

  it("recovers the account the speaker named out loud", () => {
    // Reported case: the native widget never emits an account, so it has to
    // come from the transcript.
    expect(
      resolveWidgetAccountFromTranscript(
        accounts,
        "I have spent 500 pesos for dinner today using cash",
      ),
    ).toBe("a-cash");
    expect(resolveWidgetAccountFromTranscript(accounts, "paid with my BDO card")).toBe("a-bdo");
  });

  it("matches whole account names only, preferring the longest", () => {
    expect(resolveWidgetAccountFromTranscript(walletAccounts, "paid via gcash")).toBe("a-gcash");
    expect(
      resolveWidgetAccountFromTranscript(walletAccounts, "transferred to my gcash wallet"),
    ).toBe("a-gcash-wallet");
    // "cashier" and the "cash" inside "gcash" must not select the Cash account.
    expect(resolveWidgetAccountFromTranscript(walletAccounts, "paid the cashier")).toBeNull();
    expect(resolveWidgetAccountFromTranscript(accounts, "no account named here")).toBeNull();
    expect(resolveWidgetAccountFromTranscript(accounts, null)).toBeNull();
    expect(resolveWidgetAccountFromTranscript(accounts, "   ")).toBeNull();
  });

  const balances = [
    { id: "a-bdo", balanceMinor: 300000 },
    { id: "a-empty", balanceMinor: 0 },
    { id: "a-new", balanceMinor: null },
  ];

  it("keeps a reconcile balance unknown until the dashboard read lands", () => {
    expect(resolveKnownBalanceMinor(null, "a-bdo")).toBeNull();
    expect(resolveKnownBalanceMinor(undefined, "a-bdo")).toBeNull();
    expect(resolveKnownBalanceMinor([], "a-bdo")).toBeNull();
    expect(resolveKnownBalanceMinor(balances, "")).toBeNull();
    expect(resolveKnownBalanceMinor(balances, "a-missing")).toBeNull();
    expect(resolveKnownBalanceMinor(balances, "a-new")).toBeNull();
  });

  it("still treats a real zero balance as known", () => {
    expect(resolveKnownBalanceMinor(balances, "a-empty")).toBe(0);
    expect(resolveKnownBalanceMinor(balances, "a-bdo")).toBe(300000);
  });

  it("falls back to Uncategorized, then the first of its kind", () => {
    expect(resolveWidgetCategory(categories, "expense", "Food")).toBe("c-food");
    expect(resolveWidgetCategory(categories, "expense", "Nope")).toBe("c-uncat");
    expect(resolveWidgetCategory(categories, "income")).toBeNull();
  });
});
