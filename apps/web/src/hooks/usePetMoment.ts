import { useEffect, useState } from "react";

import {
  petLocalDate,
  petMoment,
  petSeenSchema,
  type PetMoment,
  type PetSeen,
  type PetView,
} from "@zoption/shared";

export interface ShownPetMoment {
  moment: PetMoment;
  pet: PetView;
  /** What this browser showed before, which names a pet that has since died. */
  before: PetSeen | null;
}

const storageKey = (userId: string) => `zoption:pet-seen:${userId}`;

function readSeen(userId: string): PetSeen | null {
  try {
    const stored = window.localStorage.getItem(storageKey(userId));
    if (!stored) return null;
    const parsed = petSeenSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Opens the pet pop-up when the pet changed since this browser last showed it, or on the day's
 * first open. The record is per user, so a shared browser never mixes two people's pets.
 */
export function usePetMoment(userId: string, pet: PetView | undefined) {
  const [shown, setShown] = useState<ShownPetMoment | null>(null);

  useEffect(() => {
    if (!pet) return;
    const before = readSeen(userId);
    const result = petMoment(pet, before, petLocalDate(Date.now()));
    try {
      if (result.seen) window.localStorage.setItem(storageKey(userId), JSON.stringify(result.seen));
    } catch {
      // Storage blocked: the pop-up may repeat, which is better than never showing it.
    }
    if (result.moment) setShown({ moment: result.moment, pet, before });
  }, [pet, userId]);

  return { shown, close: () => setShown(null) };
}
