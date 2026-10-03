import { router } from "expo-router";
import { useEffect } from "react";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";

/**
 * Offers the egg picker once per launch to a signed-in user who has never had a pet and has not
 * turned it off, after first-run setup is finished so the two never stack. "Not now" turns the pet
 * off, which ends the offer for good.
 */
export function usePetIntroPrompt(): void {
  const pet = usePetStore((state) => state.pet);
  const introduced = usePetStore((state) => state.introduced);
  const setupDone = useOnboardingStore((state) => state.state?.step === "complete");

  useEffect(() => {
    if (introduced || !setupDone || !pet) return;
    if (!pet.enabled || pet.species !== null || pet.diedAt !== null) return;
    usePetStore.getState().markIntroduced();
    router.push("/(app)/pet");
  }, [introduced, pet, setupDone]);
}
