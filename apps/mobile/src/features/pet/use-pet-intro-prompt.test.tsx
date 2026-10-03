import { act, renderHook } from "@testing-library/react-native";
import { router } from "expo-router";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";
import { babyPet, noPet } from "./pet-test-fixtures";
import { usePetIntroPrompt } from "./use-pet-intro-prompt";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const complete = { step: "complete" } as never;

describe("usePetIntroPrompt", () => {
  beforeEach(() => {
    jest.mocked(router.push).mockReset();
    usePetStore.setState({ pet: null, introduced: false });
    useOnboardingStore.setState({ state: null });
  });

  it("opens the egg picker once, after setup is finished", async () => {
    usePetStore.setState({ pet: noPet });
    const { rerender } = await renderHook(() => usePetIntroPrompt());
    expect(router.push).not.toHaveBeenCalled();

    await act(() => useOnboardingStore.setState({ state: complete }));
    await rerender({});
    await rerender({});
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/(app)/pet");
  });

  it.each([
    ["a pet already exists", babyPet],
    ["the pet is turned off", { ...noPet, enabled: false }],
    ["the last pet died", { ...noPet, diedAt: "2026-10-06T01:00:00.000Z" }],
  ])("stays closed when %s", async (_name, pet) => {
    useOnboardingStore.setState({ state: complete });
    usePetStore.setState({ pet });
    await renderHook(() => usePetIntroPrompt());
    expect(router.push).not.toHaveBeenCalled();
  });
});
