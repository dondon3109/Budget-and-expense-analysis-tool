import { describe, expect, it } from "vitest";

import {
  persistSavedViews,
  readSavedViews,
  savedViewId,
  type SavedTransactionView,
} from "../src/transactions/savedViews";

describe("savedViews", () => {
  it("generates unique cryptographically secure view IDs", () => {
    const id1 = savedViewId();
    const id2 = savedViewId();
    expect(id1).toMatch(/^view-[a-f0-9-]+$/i);
    expect(id2).toMatch(/^view-[a-f0-9-]+$/i);
    expect(id1).not.toBe(id2);
  });

  it("reads and parses valid saved views from storage", () => {
    const mockStorage = {
      getItem: () =>
        JSON.stringify([
          {
            id: "view-1",
            name: "Grocery Expenses",
            filters: {
              search: "Supermarket",
              kind: "expense",
              accountId: "acc-1",
              categoryId: "cat-1",
              from: "2026-01-01",
              to: "2026-01-31",
            },
          },
          { invalid: true },
        ]),
    };

    const views = readSavedViews(mockStorage as unknown as Storage);
    expect(views).toHaveLength(1);
    expect(views[0]).toEqual({
      id: "view-1",
      name: "Grocery Expenses",
      filters: {
        search: "Supermarket",
        kind: "expense",
        accountId: "acc-1",
        categoryId: "cat-1",
        from: "2026-01-01",
        to: "2026-01-31",
      },
    });
  });

  it("persists saved views to storage", () => {
    let saved = "";
    const mockStorage = {
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };

    const views: SavedTransactionView[] = [
      {
        id: "view-1",
        name: "Test View",
        filters: {},
      },
    ];

    persistSavedViews(views, mockStorage as unknown as Storage);
    expect(JSON.parse(saved)).toEqual(views);
  });
});
