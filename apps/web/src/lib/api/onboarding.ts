import {
  onboardingCashResultSchema,
  onboardingStateSchema,
  quickStartStateSchema,
  type OnboardingCashInput,
  type OnboardingCashResult,
  type OnboardingState,
  type QuickStartState,
  type WorkspaceSettings,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export async function getOnboardingState(
  workspace: AuthenticatedWorkspace,
): Promise<OnboardingState> {
  return onboardingStateSchema.parse(await requestJson(workspace, "/api/app/onboarding"));
}

export async function saveOnboardingCurrency(
  workspace: AuthenticatedWorkspace,
  input: WorkspaceSettings,
): Promise<OnboardingState> {
  return onboardingStateSchema.parse(
    await requestJson(workspace, "/api/app/onboarding/currency", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function saveOnboardingCashBalance(
  workspace: AuthenticatedWorkspace,
  input: OnboardingCashInput,
): Promise<OnboardingCashResult> {
  return onboardingCashResultSchema.parse(
    await requestJson(workspace, "/api/app/onboarding/cash-balance", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function getQuickStartState(
  workspace: AuthenticatedWorkspace,
): Promise<QuickStartState> {
  return quickStartStateSchema.parse(
    await requestJson(workspace, "/api/app/onboarding/quick-start"),
  );
}

export async function dismissQuickStart(
  workspace: AuthenticatedWorkspace,
): Promise<QuickStartState> {
  return quickStartStateSchema.parse(
    await requestJson(workspace, "/api/app/onboarding/quick-start/dismiss", {
      method: "POST",
    }),
  );
}
