import {
  onboardingStateSchema,
  type OnboardingCashInput,
  type OnboardingState,
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
): Promise<OnboardingState> {
  return onboardingStateSchema.parse(
    await requestJson(workspace, "/api/app/onboarding/cash-balance", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
