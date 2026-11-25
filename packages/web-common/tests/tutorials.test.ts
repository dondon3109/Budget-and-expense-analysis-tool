import { describe, expect, it } from "vitest";

import {
  TUTORIAL_CATEGORIES,
  TUTORIALS_DATA,
  filterTutorials,
  tutorialSearchText,
} from "../src/tutorials/tutorials";

describe("tutorials catalog", () => {
  it("keeps tutorial ids and categories consistent", () => {
    const ids = TUTORIALS_DATA.map((tutorial) => tutorial.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TUTORIAL_CATEGORIES[0]).toBe("All");
    expect(TUTORIAL_CATEGORIES).toContain("Importing Data");
  });

  it("matches titles, steps, tips, and category names", () => {
    expect(filterTutorials(TUTORIALS_DATA, { query: "Income Adjustment" })).toHaveLength(1);
    expect(filterTutorials(TUTORIALS_DATA, { query: "MariBank" })).toHaveLength(1);
    expect(
      filterTutorials(TUTORIALS_DATA, { query: "isolated", category: "Privacy & Sync" }),
    ).toHaveLength(1);
    expect(
      filterTutorials(TUTORIALS_DATA, { query: "MariBank", category: "Budgeting" }),
    ).toHaveLength(0);
    expect(tutorialSearchText(TUTORIALS_DATA[0]!)).toContain("income adjustment");
  });
});
