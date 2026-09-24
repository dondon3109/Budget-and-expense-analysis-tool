import {
  parseWidgetTranscriptToIntent,
  resolveKnownBalanceMinor,
  resolveWidgetAccount,
  resolveWidgetAccountFromTranscript,
  resolveWidgetCategory,
  summarizeWidgetDescription,
  widgetTransactionDate,
} from "./widget-intent";

describe("summarizeWidgetDescription", () => {
  it("shortens and cleans spoken expense descriptions", () => {
    expect(summarizeWidgetDescription("for iced coffee at Starbucks today using gcash")).toBe(
      "Iced coffee at Starbucks",
    );
    expect(summarizeWidgetDescription("for dinner today using cash")).toBe("Dinner");
    expect(summarizeWidgetDescription("groceries at Puregold yesterday using credit card")).toBe(
      "Groceries at Puregold",
    );
    expect(summarizeWidgetDescription("bought medicine at Mercury Drug with cash")).toBe(
      "Medicine at Mercury Drug",
    );
    expect(summarizeWidgetDescription("log 45 pesos jeepney fare")).toBe("45 pesos jeepney fare");
    expect(summarizeWidgetDescription("parking fee today")).toBe("Parking fee");
    expect(summarizeWidgetDescription("on load")).toBe("Load");
  });

  it("strips custom user account names from descriptions", () => {
    const accountNames = ["Maya Wallet", "BDO Checking", "Pocket Cash"];
    expect(summarizeWidgetDescription("dinner at Jollibee using Maya Wallet", accountNames)).toBe(
      "Dinner at Jollibee",
    );
    expect(summarizeWidgetDescription("gas at Shell from BDO Checking", accountNames)).toBe(
      "Gas at Shell",
    );
  });

  it("falls back to Expense when speech contained only filler/payment terms", () => {
    expect(summarizeWidgetDescription("")).toBe("Expense");
    expect(summarizeWidgetDescription("using cash")).toBe("Expense");
    expect(summarizeWidgetDescription("today with gcash")).toBe("Expense");
  });
});

describe("parseWidgetTranscriptToIntent", () => {
  it("parses and summarizes an expense transcript", () => {
    expect(parseWidgetTranscriptToIntent("Spent 250 pesos on lunch")).toEqual({
      type: "expense",
      amountMinor: 25000,
      merchant: "Lunch",
    });
    expect(
      parseWidgetTranscriptToIntent("I have spent 500 pesos for dinner today using cash"),
    ).toEqual({
      type: "expense",
      amountMinor: 50000,
      merchant: "Dinner",
    });
  });

  it("parses a reconcile transcript", () => {
    expect(parseWidgetTranscriptToIntent("Reconcile my BDO account to 5000 pesos")).toEqual({
      type: "reconcile",
      account: "BDO",
      newBalanceMinor: 500000,
    });
  });

  it("parses income transcripts", () => {
    expect(parseWidgetTranscriptToIntent("Received 20,000 pesos salary from Acme")).toEqual({
      type: "income",
      amountMinor: 2_000_000,
      merchant: "Salary from Acme",
    });
    expect(parseWidgetTranscriptToIntent("I got paid 5k for freelance work")).toEqual({
      type: "income",
      amountMinor: 500_000,
      merchant: "Freelance work",
    });
    expect(parseWidgetTranscriptToIntent("Add income 1500 pesos")).toEqual({
      type: "income",
      amountMinor: 150_000,
      merchant: "Income",
    });
    expect(parseWidgetTranscriptToIntent("Sold my old phone for 3000")).toEqual({
      type: "income",
      amountMinor: 300_000,
      merchant: "Sold my old phone",
    });
  });

  it("keeps spending on income words an expense", () => {
    expect(parseWidgetTranscriptToIntent("Paid 8000 pesos salary to the helper")).toEqual({
      type: "expense",
      amountMinor: 800_000,
      merchant: "Salary to the helper",
    });
  });

  it("accepts a bare amount but never a date, time, or store number", () => {
    expect(parseWidgetTranscriptToIntent("salary 20,000")).toMatchObject({
      type: "income",
      amountMinor: 2_000_000,
    });
    expect(parseWidgetTranscriptToIntent("lunch on march 5 for 180")).toMatchObject({
      type: "expense",
      amountMinor: 18_000,
    });
    expect(parseWidgetTranscriptToIntent("snacks at 7-eleven 95")).toMatchObject({
      amountMinor: 9_500,
    });
    expect(parseWidgetTranscriptToIntent("dinner at 7 pm 450 pesos")).toMatchObject({
      amountMinor: 45_000,
    });
  });

  it("rejects transcripts without an amount", () => {
    expect(parseWidgetTranscriptToIntent("hello world")).toBeNull();
    expect(parseWidgetTranscriptToIntent("lunch on march 5")).toBeNull();
    expect(parseWidgetTranscriptToIntent("meeting at 3 pm")).toBeNull();
    expect(parseWidgetTranscriptToIntent("   ")).toBeNull();
  });
});

describe("widgetTransactionDate", () => {
  const now = new Date(2026, 8, 24, 12);

  it("dates a note spoken about yesterday one day back", () => {
    expect(widgetTransactionDate("spent 300 pesos on dinner yesterday", now).getDate()).toBe(23);
    expect(widgetTransactionDate("grab ride last night 250", now).getDate()).toBe(23);
    expect(widgetTransactionDate("lunch 180", now)).toBe(now);
    expect(widgetTransactionDate(null, now)).toBe(now);
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
