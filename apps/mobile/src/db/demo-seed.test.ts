import type { SQLiteDatabase } from "expo-sqlite";

import {
  DUMMY_DEV_SUBJECT,
  isDummyDevelopmentSubject,
  seedDummyWorkspaceData,
} from "./demo-seed";

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
});
