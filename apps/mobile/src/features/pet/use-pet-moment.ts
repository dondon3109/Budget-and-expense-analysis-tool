import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";

import {
  petLocalDate,
  petMoment,
  petSeenSchema,
  type PetMoment,
  type PetSeen,
  type PetView,
} from "@zoption/shared";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";

const SEEN_STORAGE_KEY = "zoption-mobile-pet-seen-v1";

export interface ShownPetMoment {
  moment: PetMoment;
  pet: PetView;
  /** What the device showed before, which names a pet that has since died. */
  before: PetSeen | null;
}

async function readSeen(): Promise<PetSeen | null> {
  const stored = await SecureStore.getItemAsync(SEEN_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = petSeenSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Decisions run one after another, so two quick check-ins cannot both read the old record and
// announce the same change twice.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Opens the pet pop-up on Home when the pet changed since this device last showed it, or on the
 * day's first open. Waits for first-run setup so it never stacks on the setup prompt.
 */
export function usePetMoment(): { shown: ShownPetMoment | null; close: () => void } {
  const pet = usePetStore((state) => state.pet);
  const setupDone = useOnboardingStore((state) => state.state?.step === "complete");
  const [shown, setShown] = useState<ShownPetMoment | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pet || !setupDone) return;
    queue = queue
      .then(async () => {
        const before = await readSeen();
        const result = petMoment(pet, before, petLocalDate(Date.now()));
        if (result.seen)
          await SecureStore.setItemAsync(SEEN_STORAGE_KEY, JSON.stringify(result.seen));
        if (result.moment && mounted.current) setShown({ moment: result.moment, pet, before });
      })
      // The pop-up is a nicety: a storage failure skips it rather than surfacing an error.
      .catch(() => undefined);
  }, [pet, setupDone]);

  return { shown, close: () => setShown(null) };
}

/** Forgets what this device showed. Runs on each identity change, like the pet alerts. */
export async function clearPetMoment(): Promise<void> {
  await SecureStore.deleteItemAsync(SEEN_STORAGE_KEY);
}
