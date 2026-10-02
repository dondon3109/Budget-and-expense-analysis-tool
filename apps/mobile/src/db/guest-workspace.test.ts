import type { SQLiteDatabase } from "expo-sqlite";

import { GUEST_SUBJECT, isGuestSubject, seedGuestWorkspace } from "./guest-workspace";

describe("guest workspace", () => {
  it("recognizes only its own subject", () => {
    expect(isGuestSubject(GUEST_SUBJECT)).toBe(true);
    expect(isGuestSubject("08060c19-8a55-4046-a2e7-7384808dd81c")).toBe(false);
    expect(isGuestSubject(null)).toBe(false);
  });

  it("seeds the starter accounts and categories in one transaction, without an outbox row", async () => {
    const statements: string[] = [];
    const database = {
      withTransactionAsync: jest.fn((task: () => Promise<void>) => task()),
      runAsync: jest.fn((sql: string) => {
        statements.push(sql);
        return Promise.resolve();
      }),
    } as unknown as SQLiteDatabase;

    await seedGuestWorkspace(database);

    expect(database.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(statements.filter((sql) => sql.includes("INTO accounts"))).toHaveLength(3);
    expect(statements.filter((sql) => sql.includes("INTO categories"))).toHaveLength(7);
    expect(statements.some((sql) => sql.includes("sync_outbox"))).toBe(false);
  });
});
