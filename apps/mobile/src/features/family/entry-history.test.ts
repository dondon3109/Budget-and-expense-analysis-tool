import type { FamilyEntryView } from "@zoption/shared";

import { describeEntryEvent } from "./entry-history";

const view: FamilyEntryView = {
  date: "2026-10-18",
  description: "Rice",
  amountMinor: -50_000,
  currency: "PHP",
  kind: "expense",
  categoryName: "Groceries",
  accountName: "Cash",
  notes: null,
};

describe("describeEntryEvent", () => {
  it("names the fields an edit changed", () => {
    expect(
      describeEntryEvent({
        action: "updated",
        userId: "u",
        at: "2026-10-19 08:00:00",
        before: view,
        after: { ...view, amountMinor: -60_000, date: "2026-10-19", notes: "50kg" },
      }),
    ).toBe("changed the amount, date and notes");
  });

  it("says when an entry was deleted", () => {
    expect(
      describeEntryEvent({ action: "deleted", userId: "u", at: "t", before: view, after: null }),
    ).toBe("deleted it");
  });
});
