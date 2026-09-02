import { describe, expect, it } from "vitest";
import {
  FINANCE_GUIDES,
  getAllFinanceGuides,
  getFinanceGuideBySlug,
  type FinanceGuide,
} from "../src/financeGuides";
import * as SharedIndex from "../src/index";

describe("finance guides content and helper functions", () => {
  it("exports finance guides types and helpers through index.ts", () => {
    expect(SharedIndex.getAllFinanceGuides).toBeDefined();
    expect(SharedIndex.getFinanceGuideBySlug).toBeDefined();
    expect(SharedIndex.FINANCE_GUIDES).toBeDefined();
  });

  it("contains exactly 4 core comprehensive Philippine personal finance guides", () => {
    const guides = getAllFinanceGuides();
    expect(guides).toHaveLength(4);
    expect(FINANCE_GUIDES).toHaveLength(4);

    const slugs = guides.map((g) => g.slug);
    expect(slugs).toEqual([
      "track-gcash-maya-without-bank-linking",
      "cancel-subscriptions-auto-debits-philippines",
      "high-yield-digital-banking-cashflow-guide",
      "replace-excel-spreadsheets-budget-tracker",
    ]);
  });

  it("ensures all guides adhere to the FinanceGuide data model with valid metadata", () => {
    const validCategories = new Set(["budgeting", "subscriptions", "banking", "tools"]);
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

    for (const guide of getAllFinanceGuides()) {
      expect(guide.slug.length).toBeGreaterThan(0);
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.seoTitle.length).toBeGreaterThan(0);
      expect(guide.description.length).toBeGreaterThan(20);
      expect(validCategories.has(guide.category)).toBe(true);
      expect(guide.readTimeMinutes).toBeGreaterThan(0);
      expect(guide.author.length).toBeGreaterThan(0);
      expect(guide.publishedDate).toMatch(isoDateRegex);
      expect(guide.updatedDate).toMatch(isoDateRegex);
      expect(guide.keywords.length).toBeGreaterThanOrEqual(3);
      expect(guide.sections.length).toBeGreaterThanOrEqual(3);
      expect(guide.faqs.length).toBeGreaterThanOrEqual(2);

      // Section checks
      for (const section of guide.sections) {
        expect(section.id.length).toBeGreaterThan(0);
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.content.length).toBeGreaterThan(50);
        if (section.keyTakeaways) {
          expect(section.keyTakeaways.length).toBeGreaterThan(0);
          for (const item of section.keyTakeaways) {
            expect(item.length).toBeGreaterThan(0);
          }
        }
      }

      // FAQ checks
      for (const faq of guide.faqs) {
        expect(faq.question.length).toBeGreaterThan(0);
        expect(faq.answer.length).toBeGreaterThan(0);
      }
    }
  });

  it("finds guides by slug accurately and handles casing / whitespace", () => {
    const gcashGuide = getFinanceGuideBySlug("track-gcash-maya-without-bank-linking");
    expect(gcashGuide).not.toBeNull();
    expect(gcashGuide?.title).toBe("How to Track GCash & Maya Expenses Without Bank Linking");
    expect(gcashGuide?.category).toBe("budgeting");

    const cancelGuide = getFinanceGuideBySlug("  cancel-subscriptions-auto-debits-philippines  ");
    expect(cancelGuide).not.toBeNull();
    expect(cancelGuide?.slug).toBe("cancel-subscriptions-auto-debits-philippines");
    expect(cancelGuide?.category).toBe("subscriptions");

    const bankGuide = getFinanceGuideBySlug("HIGH-YIELD-DIGITAL-BANKING-CASHFLOW-GUIDE");
    expect(bankGuide).not.toBeNull();
    expect(bankGuide?.slug).toBe("high-yield-digital-banking-cashflow-guide");
    expect(bankGuide?.category).toBe("banking");

    const excelGuide = getFinanceGuideBySlug("replace-excel-spreadsheets-budget-tracker");
    expect(excelGuide).not.toBeNull();
    expect(excelGuide?.slug).toBe("replace-excel-spreadsheets-budget-tracker");
    expect(excelGuide?.category).toBe("tools");
  });

  it("returns null for non-existent slugs or invalid inputs", () => {
    expect(getFinanceGuideBySlug("non-existent-guide-slug")).toBeNull();
    expect(getFinanceGuideBySlug("")).toBeNull();
    expect(getFinanceGuideBySlug("   ")).toBeNull();
    // @ts-expect-error testing invalid type input at runtime
    expect(getFinanceGuideBySlug(undefined)).toBeNull();
    // @ts-expect-error testing invalid type input at runtime
    expect(getFinanceGuideBySlug(null)).toBeNull();
  });
});
