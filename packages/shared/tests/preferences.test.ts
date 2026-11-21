import { describe, expect, it } from "vitest";

import { suggestCurrencyForLocale } from "../src/currencies";
import { goalCtaActions, goalCtaRoutes } from "../src/goalConfig";
import { primaryGoalLabel } from "../src/goals";
import {
  budgetingStyleLabel,
  budgetingStyles,
  emptyMoneyPreferences,
  hasMoneyPreferences,
  incomeCadenceLabel,
  incomeCadences,
  leadStarterPrompts,
  moneyPreferencesSchema,
  openPreferenceSuggestions,
  preferenceStarterPrompt,
  preferenceSuggestions,
  preferencesContextLine,
  spendingFocusLabel,
  type MoneyPreferences,
} from "../src/preferences";

const none = { has_budget: false, has_savings_goal: false, has_subscription: false };
const prefs = (overrides: Partial<MoneyPreferences>): MoneyPreferences => ({
  ...emptyMoneyPreferences,
  ...overrides,
});

describe("money preferences schema", () => {
  it("accepts an empty answer and a full one", () => {
    expect(moneyPreferencesSchema.parse(emptyMoneyPreferences)).toEqual(emptyMoneyPreferences);
    const full = prefs({
      incomeCadence: "semi_monthly",
      budgetingStyle: "zero_based",
      spendingFocus: ["food", "bills", "transport"],
    });
    expect(moneyPreferencesSchema.parse(full)).toEqual(full);
  });

  it("rejects unknown keys, unknown values, repeats, and more than three focuses", () => {
    expect(moneyPreferencesSchema.safeParse({ ...emptyMoneyPreferences, x: 1 }).success).toBe(
      false,
    );
    expect(
      moneyPreferencesSchema.safeParse(prefs({ incomeCadence: "daily" as never })).success,
    ).toBe(false);
    expect(
      moneyPreferencesSchema.safeParse(prefs({ spendingFocus: ["food", "food"] })).success,
    ).toBe(false);
    expect(
      moneyPreferencesSchema.safeParse(
        prefs({ spendingFocus: ["food", "bills", "transport", "fun"] }),
      ).success,
    ).toBe(false);
  });

  it("knows when nothing was answered", () => {
    expect(hasMoneyPreferences(null)).toBe(false);
    expect(hasMoneyPreferences(emptyMoneyPreferences)).toBe(false);
    expect(hasMoneyPreferences(prefs({ spendingFocus: ["fun"] }))).toBe(true);
  });
});

describe("preference suggestions", () => {
  it("suggests nothing without preferences", () => {
    expect(preferenceSuggestions(null)).toEqual([]);
    expect(preferenceSuggestions(emptyMoneyPreferences)).toEqual([]);
  });

  it("uses valid targets for every cadence and style", () => {
    const targets: readonly string[] = [...goalCtaActions, ...goalCtaRoutes];
    for (const incomeCadence of incomeCadences) {
      for (const budgetingStyle of budgetingStyles) {
        const list = preferenceSuggestions(
          prefs({ incomeCadence, budgetingStyle, spendingFocus: ["bills"] }),
        );
        expect(list.length).toBeGreaterThan(0);
        for (const item of list) expect(targets).toContain(item.target);
        // One per signal.
        expect(new Set(list.map((item) => item.signal)).size).toBe(list.length);
      }
    }
  });

  it("leads with the style, then pay cadence, then bills", () => {
    const list = preferenceSuggestions(
      prefs({
        incomeCadence: "irregular",
        budgetingStyle: "fifty_thirty_twenty",
        spendingFocus: ["bills"],
      }),
    );
    expect(list.map((item) => item.id)).toEqual([
      "fifty_thirty_twenty",
      "buffer_month",
      "add_bills",
    ]);
  });

  it("names the focus categories in the category limits suggestion", () => {
    const [first] = preferenceSuggestions(
      prefs({ budgetingStyle: "category_limits", spendingFocus: ["food", "transport"] }),
    );
    expect(first?.detail).toContain("food and groceries, transport");
  });

  it("drops suggestions the workspace already did", () => {
    const preferences = prefs({
      incomeCadence: "irregular",
      budgetingStyle: "zero_based",
      spendingFocus: ["bills"],
    });
    expect(openPreferenceSuggestions(preferences, none)).toHaveLength(3);
    expect(
      openPreferenceSuggestions(preferences, {
        ...none,
        has_budget: true,
        has_subscription: true,
      }).map((item) => item.id),
    ).toEqual(["buffer_month"]);
  });
});

describe("preference prompts", () => {
  it("leads with pay timing for twice-monthly and irregular pay, else the first focus", () => {
    expect(
      preferenceStarterPrompt(prefs({ incomeCadence: "semi_monthly", spendingFocus: ["food"] })),
    ).toBe("How much can I spend until my next payday?");
    expect(
      preferenceStarterPrompt(prefs({ incomeCadence: "monthly", spendingFocus: ["food"] })),
    ).toBe("How much did I spend on food this month?");
    expect(preferenceStarterPrompt(emptyMoneyPreferences)).toBeNull();
  });

  it("puts the lead prompts first and keeps the list length", () => {
    expect(leadStarterPrompts(["a", "b", "c"], ["x", null, "b"])).toEqual(["x", "b", "a"]);
    expect(leadStarterPrompts(["a", "b"], [null, null])).toEqual(["a", "b"]);
  });

  it("describes the preferences for the assistant by key", () => {
    expect(preferencesContextLine(emptyMoneyPreferences)).toBeNull();
    expect(
      preferencesContextLine(
        prefs({ incomeCadence: "weekly", budgetingStyle: "not_sure", spendingFocus: ["fun"] }),
      ),
    ).toBe("User preferences: paid weekly; budgeting style not_sure; watching fun.");
  });
});

describe("currency-localized onboarding labels and locale suggestion", () => {
  it("keeps PH phrasing for PHP and drops it for other currencies", () => {
    expect(incomeCadenceLabel("semi_monthly", "PHP")).toBe("Twice a month (kinsenas)");
    expect(incomeCadenceLabel("semi_monthly", "USD")).toBe("Twice a month");
    expect(budgetingStyleLabel("zero_based", "PHP")).toBe("Give every peso a job");
    expect(budgetingStyleLabel("zero_based", "USD")).toBe("Zero-based: give all income a job");
    expect(spendingFocusLabel("family_support", "PHP")).toBe("Family support / padala");
    expect(spendingFocusLabel("family_support", "EUR")).toBe("Family support");
    expect(primaryGoalLabel("reduce_debt", "PHP")).toBe("Pay off debt / utang");
    expect(primaryGoalLabel("reduce_debt", "USD")).toBe("Pay off debt");

    const usdSuggestions = preferenceSuggestions(
      prefs({ budgetingStyle: "zero_based", spendingFocus: ["family_support"] }),
      "USD",
    );
    expect(usdSuggestions[0]?.title).toBe("Give all your income a job");
    const catSuggestions = preferenceSuggestions(
      prefs({ budgetingStyle: "category_limits", spendingFocus: ["family_support"] }),
      "USD",
    );
    expect(catSuggestions[0]?.detail).not.toContain("padala");
  });

  it("suggests a supported currency from BCP 47 locales and falls back to PHP", () => {
    expect(suggestCurrencyForLocale("en-US")).toBe("USD");
    expect(suggestCurrencyForLocale("en_PH")).toBe("PHP");
    expect(suggestCurrencyForLocale("fr-FR")).toBe("EUR");
    expect(suggestCurrencyForLocale("ja-JP")).toBe("JPY");
    expect(suggestCurrencyForLocale("zh-Hant-TW")).toBe("TWD");
    expect(suggestCurrencyForLocale("en")).toBe("PHP");
    expect(suggestCurrencyForLocale(undefined)).toBe("PHP");
  });
});
