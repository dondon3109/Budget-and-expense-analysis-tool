// Workspace-wide settings shared by every client.

import { z } from "zod";

import { BUDGET_AND_SUBSCRIPTION_MAX_MINOR } from "../limits";
import { currencies } from "../types";
import { isoDateSchema } from "./common";

/**
 * The workspace currency labels every amount that does not carry its own (budgets, goals,
 * debts, plans, dashboard totals), is the base other currencies convert into for cashflow
 * trends, and is the default for new accounts. Changing it never rewrites a stored amount.
 */
export const workspaceSettingsSchema = z.object({ currency: z.enum(currencies) }).strict();

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export const workspaceSettingsUpdateSchema = workspaceSettingsSchema;

export type WorkspaceSettingsUpdate = z.infer<typeof workspaceSettingsUpdateSchema>;

export const onboardingSteps = ["currency", "cash", "complete"] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

/** Where first-run onboarding stands, with the workspace currency it saves through settings. */
export const onboardingStateSchema = z
  .object({ step: z.enum(onboardingSteps), currency: z.enum(currencies) })
  .strict();

export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/** Step 1 saves the base currency exactly as Account Settings does. */
export const onboardingCurrencySchema = workspaceSettingsUpdateSchema;

/**
 * Step 2: the physical cash on hand in the workspace currency, in minor units (zero is allowed),
 * dated the user's calendar day. Clients parse the typed amount with `parseAmountToMinor`.
 */
export const onboardingCashSchema = z
  .object({
    amountMinor: z
      .number()
      .int()
      .min(0, "Cash on hand cannot be negative.")
      .max(BUDGET_AND_SUBSCRIPTION_MAX_MINOR, "That amount is too large."),
    date: isoDateSchema,
  })
  .strict();

export type OnboardingCashInput = z.infer<typeof onboardingCashSchema>;
