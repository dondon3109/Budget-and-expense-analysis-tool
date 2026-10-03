import {
  onboardingCashResultSchema,
  onboardingStateSchema,
  type OnboardingCashInput,
  type OnboardingCashResult,
  type OnboardingState,
  type WorkspaceSettingsUpdate,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

export interface OnboardingApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const PATH = "/api/app/onboarding";

export function getOnboardingState(api: OnboardingApi): Promise<OnboardingState> {
  return apiRequest({
    ...api,
    path: PATH,
    method: "GET",
    fallback: "Zoption could not read your setup. Try again shortly.",
    decode: (value) => onboardingStateSchema.parse(value),
  });
}

export function saveOnboardingCurrency(
  api: OnboardingApi,
  input: WorkspaceSettingsUpdate,
): Promise<OnboardingState> {
  return apiRequest({
    ...api,
    path: `${PATH}/currency`,
    method: "POST",
    body: input,
    fallback: "Zoption could not save your currency. Try again shortly.",
    decode: (value) => onboardingStateSchema.parse(value),
  });
}

export function saveOnboardingCash(
  api: OnboardingApi,
  input: OnboardingCashInput,
): Promise<OnboardingCashResult> {
  return apiRequest({
    ...api,
    path: `${PATH}/cash-balance`,
    method: "POST",
    body: input,
    fallback: "Zoption could not save your cash on hand. Try again shortly.",
    decode: (value) => onboardingCashResultSchema.parse(value),
  });
}
