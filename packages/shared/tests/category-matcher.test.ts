import { describe, expect, it } from "vitest";

import { matchCategory, type CategoryCandidate } from "../src/categoryMatcher";

const testCategories: CategoryCandidate[] = [
  { id: "cat-salary", name: "Salary", kind: "income" },
  { id: "cat-food", name: "Food & dining", kind: "expense" },
  { id: "cat-transport", name: "Transport", kind: "expense" },
  { id: "cat-utilities", name: "Utilities", kind: "expense" },
  { id: "cat-housing", name: "Housing", kind: "expense" },
  { id: "cat-leisure", name: "Leisure", kind: "expense" },
  { id: "cat-savings", name: "Savings transfer", kind: "transfer" },
  { id: "cat-uncategorized", name: "Uncategorized", kind: "expense" },
];

describe("matchCategory", () => {
  it("matches verbatim exact names ignoring case and leading/trailing whitespace", () => {
    expect(matchCategory(testCategories, "Food & dining")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "food & dining")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "  Transport  ")?.id).toBe("cat-transport");
    expect(matchCategory(testCategories, "SALARY")?.id).toBe("cat-salary");
  });

  it("matches normalized variations including ampersand and punctuation", () => {
    expect(matchCategory(testCategories, "Food and dining")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Food & Dining")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Savings-transfer")?.id).toBe("cat-savings");
  });

  it("matches candidate that is a component token of the category name", () => {
    expect(matchCategory(testCategories, "Food")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Dining")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Savings")?.id).toBe("cat-savings");
  });

  it("matches candidate using common morphological stems", () => {
    expect(matchCategory(testCategories, "Transportation")?.id).toBe("cat-transport");

    const categoriesWithGrocery: CategoryCandidate[] = [
      { id: "cat-grocery", name: "Grocery", kind: "expense" },
      { id: "cat-other", name: "Other", kind: "expense" },
    ];
    expect(matchCategory(categoriesWithGrocery, "Groceries")?.id).toBe("cat-grocery");
  });

  it("matches semantic synonyms and domain aliases", () => {
    // Food synonyms
    expect(matchCategory(testCategories, "Groceries")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Restaurant")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Coffee")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Lunch")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "GrabFood")?.id).toBe("cat-food");

    // Transport synonyms
    expect(matchCategory(testCategories, "Gas")?.id).toBe("cat-transport");
    expect(matchCategory(testCategories, "Gasoline")?.id).toBe("cat-transport");
    expect(matchCategory(testCategories, "Grab")?.id).toBe("cat-transport");
    expect(matchCategory(testCategories, "Uber")?.id).toBe("cat-transport");
    expect(matchCategory(testCategories, "Fare")?.id).toBe("cat-transport");
    expect(matchCategory(testCategories, "Toll")?.id).toBe("cat-transport");

    // Utilities synonyms
    expect(matchCategory(testCategories, "Bills")?.id).toBe("cat-utilities");
    expect(matchCategory(testCategories, "Electricity")?.id).toBe("cat-utilities");
    expect(matchCategory(testCategories, "Meralco")?.id).toBe("cat-utilities");
    expect(matchCategory(testCategories, "Water")?.id).toBe("cat-utilities");
    expect(matchCategory(testCategories, "Internet")?.id).toBe("cat-utilities");
    expect(matchCategory(testCategories, "Wifi")?.id).toBe("cat-utilities");

    // Housing synonyms
    expect(matchCategory(testCategories, "Rent")?.id).toBe("cat-housing");
    expect(matchCategory(testCategories, "Mortgage")?.id).toBe("cat-housing");
    expect(matchCategory(testCategories, "Condo dues")?.id).toBe("cat-housing");

    // Leisure synonyms
    expect(matchCategory(testCategories, "Shopping")?.id).toBe("cat-leisure");
    expect(matchCategory(testCategories, "Gifts")?.id).toBe("cat-leisure");
    expect(matchCategory(testCategories, "Entertainment")?.id).toBe("cat-leisure");
    expect(matchCategory(testCategories, "Cinema")?.id).toBe("cat-leisure");

    // Salary synonyms
    expect(matchCategory(testCategories, "Wages")?.id).toBe("cat-salary");
    expect(matchCategory(testCategories, "Paycheck")?.id).toBe("cat-salary");
    expect(matchCategory(testCategories, "Freelance")?.id).toBe("cat-salary");
  });

  it("filters by kind when specified", () => {
    // If kind is expense, salary (income) is ignored
    expect(matchCategory(testCategories, "Income", { kind: "expense" })).toBeUndefined();
    expect(matchCategory(testCategories, "Salary", { kind: "income" })?.id).toBe("cat-salary");
    expect(matchCategory(testCategories, "Salary", { kind: "expense" })).toBeUndefined();
  });

  it("ignores archived, locked, or pending categories", () => {
    const listWithFlags: CategoryCandidate[] = [
      { id: "cat-food-archived", name: "Food & dining", kind: "expense", archived: true },
      { id: "cat-food-locked", name: "Food & dining", kind: "expense", locked: true },
      { id: "cat-food-pending", name: "Food & dining", kind: "expense", pending: true },
    ];
    expect(matchCategory(listWithFlags, "Food")).toBeUndefined();

    const listWithActiveFallback: CategoryCandidate[] = [
      { id: "cat-food-archived", name: "Food & dining", kind: "expense", archived: true },
      { id: "cat-groceries-active", name: "Groceries", kind: "expense" },
    ];
    expect(matchCategory(listWithActiveFallback, "Food")?.id).toBe("cat-groceries-active");
  });

  it("falls back to context text when candidateName is missing or generic", () => {
    expect(
      matchCategory(testCategories, null, {
        contextText: "Bought groceries at supermarket for 1,500 pesos",
      })?.id,
    ).toBe("cat-food");

    expect(
      matchCategory(testCategories, undefined, {
        contextText: "Paid meralco electric bill 3500",
      })?.id,
    ).toBe("cat-utilities");

    expect(
      matchCategory(testCategories, "General Expense", {
        contextText: "Booked a grab car to makati",
      })?.id,
    ).toBe("cat-transport");
  });

  it("returns undefined when no category matches", () => {
    expect(matchCategory(testCategories, "Alien Artifact")).toBeUndefined();
    expect(matchCategory([], "Food")).toBeUndefined();
    expect(matchCategory(testCategories, null, null)).toBeUndefined();
  });

  it("does not falsely match Uncategorized for other domain terms", () => {
    expect(matchCategory(testCategories, "Groceries")?.id).toBe("cat-food");
    expect(matchCategory(testCategories, "Uncategorized")?.id).toBe("cat-uncategorized");
  });
});
