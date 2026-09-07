import {
  autoMapFirstRunColumns,
  countFirstRunDuplicates,
  FIRST_RUN_IMPORT_STEPS,
  firstRunStepIndex,
  markFirstRunDuplicates,
} from "./first-run-import";

describe("first-run import column auto-map", () => {
  it("auto-maps BPI debit/credit headers", () => {
    const headers = [
      "Date",
      "Branch",
      "Transaction Date",
      "Transaction Description",
      "Debit Amount",
      "Credit Amount",
      "Running Balance",
    ];
    const { preset, mapping, amountMode } = autoMapFirstRunColumns("bpi-statement.csv", headers);
    expect(preset.id).toBe("bpi");
    expect(amountMode).toBe("debit-credit");
    expect(mapping).toMatchObject({
      date: "Transaction Date",
      description: "Transaction Description",
      debit: "Debit Amount",
      credit: "Credit Amount",
    });
  });

  it("auto-maps date, merchant, and amount columns on a generic export", () => {
    const { preset, mapping, amountMode } = autoMapFirstRunColumns("history.csv", [
      "Date",
      "Merchant",
      "Amount",
      "Category",
    ]);
    expect(preset.id).toBe("generic");
    expect(amountMode).toBe("amount");
    expect(mapping).toMatchObject({
      date: "Date",
      description: "Merchant",
      amount: "Amount",
      category: "Category",
    });
  });
});

describe("first-run import dedupe fingerprint skip", () => {
  const accountSource = "bpi-statement.csv";

  it("keeps the first occurrence and flags within-file repeats", async () => {
    const flags = await markFirstRunDuplicates([
      { date: "2026-07-20", amountMinor: 125050, description: "Weekend groceries", accountSource },
      { date: "2026-07-21", amountMinor: 50000, description: "Coffee", accountSource },
      { date: "2026-07-20", amountMinor: 125050, description: "Weekend groceries", accountSource },
    ]);
    expect(flags).toEqual([false, false, true]);
    await expect(
      countFirstRunDuplicates([
        { date: "2026-07-20", amountMinor: 125050, description: "Weekend groceries", accountSource },
        { date: "2026-07-21", amountMinor: 50000, description: "Coffee", accountSource },
        { date: "2026-07-20", amountMinor: 125050, description: "Weekend groceries", accountSource },
      ]),
    ).resolves.toBe(1);
  });

  it("treats case and whitespace variants as the same row", async () => {
    const flags = await markFirstRunDuplicates([
      { date: "2026-07-20", amountMinor: 125050, description: "Weekend  groceries", accountSource },
      { date: "2026-07-20", amountMinor: 125050, description: "weekend groceries ", accountSource },
    ]);
    expect(flags).toEqual([false, true]);
  });

  it("keeps distinct rows unflagged", async () => {
    const flags = await markFirstRunDuplicates([
      { date: "2026-07-20", amountMinor: 125050, description: "Groceries", accountSource },
      { date: "2026-07-20", amountMinor: 125051, description: "Groceries", accountSource },
      { date: "2026-07-21", amountMinor: 125050, description: "Groceries", accountSource },
    ]);
    expect(flags).toEqual([false, false, false]);
  });
});

describe("first-run import steps", () => {
  it("stays a 3-step guided flow", () => {
    expect(FIRST_RUN_IMPORT_STEPS).toHaveLength(3);
    expect(firstRunStepIndex("choose")).toBe(0);
    expect(firstRunStepIndex("configure")).toBe(1);
    expect(firstRunStepIndex("preview")).toBe(2);
    expect(firstRunStepIndex("done")).toBe(2);
  });
});
