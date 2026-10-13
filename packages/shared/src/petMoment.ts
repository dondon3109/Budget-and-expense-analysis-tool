import { petStages } from "./pet";
import type { PetSeen, PetView } from "./schemas/pet";

/** Why the pet pop-up opens: a change since this device last showed it, or the first open of a day. */
export type PetMoment = "ready" | "grew" | "sick" | "died" | "daily";

/**
 * Decides whether the pet pop-up opens for `view`, given what this device showed last. Each client
 * stores the returned `seen` whatever the answer, so a change is announced once. A change wins over
 * the daily pop-up, and showing either counts as that day's. `today` is the Manila date.
 */
export function petMoment(
  view: PetView,
  seen: PetSeen | null,
  today: string,
): { moment: PetMoment | null; seen: PetSeen | null } {
  if (!view.enabled || (view.species === null && view.diedAt === null)) {
    return { moment: null, seen };
  }
  const current = {
    species: view.species,
    stage: view.stage,
    unwell: view.healthState === "sick" || view.healthState === "fading",
    ready: view.stage === "egg" && view.eggStreakDays >= view.eggHatchDays,
    diedAt: view.diedAt,
  };
  const change = seen ? changeSince(seen, current) : null;
  if (change) return { moment: change, seen: { ...current, date: today } };
  if (seen?.date !== today) return { moment: "daily", seen: { ...current, date: today } };
  return { moment: null, seen: { ...current, date: seen.date } };
}

function changeSince(seen: PetSeen, current: Omit<PetSeen, "date">): PetMoment | null {
  if (current.species === null) return current.diedAt !== seen.diedAt ? "died" : null;
  // A new egg, or a different pet since: nothing to compare against.
  if (current.species !== seen.species) return null;
  if (current.ready && !seen.ready) return "ready";
  // Tapping the egg open is its own celebration, so hatching into a Baby raises no pop-up.
  if (seen.stage === "egg") return null;
  if (petStages.indexOf(current.stage) > petStages.indexOf(seen.stage)) return "grew";
  if (current.unwell && !seen.unwell) return "sick";
  return null;
}
