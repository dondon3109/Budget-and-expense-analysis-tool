import { render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { getOnboardingState } from "@/api/onboarding";
import { useOnboardingStore } from "@/stores/onboarding-store";

import { useOnboardingPrompt } from "./use-onboarding-prompt";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-in",
    subject: "user-1",
    getAccessToken: async () => "token",
  }),
}));
jest.mock("@/api/onboarding", () => ({ getOnboardingState: jest.fn() }));

function Probe() {
  useOnboardingPrompt();
  return null;
}

describe("useOnboardingPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.getState().reset();
  });

  it("opens setup once while the Worker says it is unfinished", async () => {
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });
    const view = await render(<Probe />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(app)/onboarding"));
    await view.rerender(<Probe />);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("stays closed for a finished workspace and when the Worker is unreachable", async () => {
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "PHP" });
    await render(<Probe />);
    await waitFor(() => expect(useOnboardingStore.getState().state?.step).toBe("complete"));
    expect(router.push).not.toHaveBeenCalled();

    useOnboardingStore.getState().reset();
    jest.mocked(getOnboardingState).mockRejectedValue(new Error("offline"));
    await render(<Probe />);
    await waitFor(() => expect(getOnboardingState).toHaveBeenCalledTimes(2));
    expect(router.push).not.toHaveBeenCalled();
  });
});
