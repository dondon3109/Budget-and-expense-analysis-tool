import type { SQLiteDatabase } from "expo-sqlite";

import { DUMMY_DEV_SUBJECT, isDummyDevelopmentSubject, seedDummyWorkspaceData } from "./demo-seed";

let mockDevelopmentVariant = true;

jest.mock("@/config/app-variant", () => ({
  assertDevelopmentAppVariant: () => {
    if (!mockDevelopmentVariant) {
      throw new Error("Demo data is available only in Zoption Dev.");
    }
  },
  isDevelopmentAppVariant: () => mockDevelopmentVariant,
}));

describe("demo workspace boundary", () => {
  beforeEach(() => {
    mockDevelopmentVariant = true;
  });

  it("recognizes the dummy subject only in Zoption Dev", () => {
    expect(isDummyDevelopmentSubject(DUMMY_DEV_SUBJECT)).toBe(true);
    mockDevelopmentVariant = false;
    expect(isDummyDevelopmentSubject(DUMMY_DEV_SUBJECT)).toBe(false);
  });

  it("rejects seeding before opening a transaction outside Zoption Dev", async () => {
    mockDevelopmentVariant = false;
    const withTransactionAsync = jest.fn();
    const database = { withTransactionAsync } as unknown as SQLiteDatabase;

    await expect(seedDummyWorkspaceData(database)).rejects.toThrow(
      "Demo data is available only in Zoption Dev.",
    );
    expect(withTransactionAsync).not.toHaveBeenCalled();
  });

  it("dates budgets and spending in the month the seed runs, never after today", async () => {
    const statements: string[] = [];
    const database = {
      withTransactionAsync: async (work: () => Promise<void>) => work(),
      runAsync: async (sql: string) => {
        statements.push(sql);
      },
    } as unknown as SQLiteDatabase;

    await seedDummyWorkspaceData(database, new Date(2026, 10, 19, 9));

    const seeded = statements.join("\n");
    expect(seeded).toContain("'budget-2026-11-01-groceries', 'category-groceries', '2026-11-01'");
    expect(seeded).toContain("'budget-2026-10-01-groceries', 'category-groceries', '2026-10-01'");
    expect(seeded).toContain("'2026-11-15', 'Bi-Monthly Salary Deposit'");
    // Day 23 of the current month has not happened yet, so it lands on today.
    expect(seeded).toContain("'2026-11-19', 'SM Supermarket Groceries'");
    expect(seeded).toContain("'2026-10-31', 'End of Month Salary Deposit'");
    expect(seeded).toContain("'Netflix 4K', 54900, 'PHP', 'monthly', '2026-12-01'");
    expect(seeded).not.toMatch(/2026-08|2026-09/);
  });
});
