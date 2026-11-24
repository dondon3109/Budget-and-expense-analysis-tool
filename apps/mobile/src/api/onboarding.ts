import {
  onboardingCashResultSchema,
  onboardingStateSchema,
  quickStartStateSchema,
  type OnboardingCashInput,
  type OnboardingCashResult,
  type OnboardingState,
  type QuickStartState,
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

export function getQuickStartState(api: OnboardingApi): Promise<QuickStartState> {
  return apiRequest({
    ...api,
    path: `${PATH}/quick-start`,
    method: "GET",
    fallback: "Zoption could not check your quick start guide.",
    decode: (value) => quickStartStateSchema.parse(value),
  });
}

export function dismissQuickStart(api: OnboardingApi): Promise<QuickStartState> {
  return apiRequest({
    ...api,
    path: `${PATH}/quick-start/dismiss`,
    method: "POST",
    fallback: "Zoption could not dismiss your quick start guide.",
    decode: (value) => quickStartStateSchema.parse(value),
  });
}
