import { PET_ACTION_RULES, type PetSpecies, type PetStage, type PetView } from "@zoption/shared";

export const petSpeciesLabels: Record<PetSpecies, string> = {
  hedgehog: "Hedgehog",
  pig: "Pig",
  hamster: "Hamster",
  penguin: "Penguin",
  panda: "Panda",
  hippo: "Hippo",
};

export const petStageLabels: Record<PetStage, string> = {
  egg: "Egg",
  baby: "Baby",
  juvenile: "Juvenile",
  adult: "Adult",
  monster: "Monster",
};

/** How each action earns points, in the order the pet screen lists them. */
export const petEarningRows = [
  { label: "Open Zoption", rule: PET_ACTION_RULES.login },
  { label: "Log a transaction", rule: PET_ACTION_RULES.transaction },
  { label: "Add a subscription", rule: PET_ACTION_RULES.subscription },
  { label: "Pay a debt", rule: PET_ACTION_RULES.debt_payment },
  { label: "Chat with the AI Assistant", rule: PET_ACTION_RULES.assistant },
] as const;

export type PetMood = "egg" | "cute" | "aggressive" | "sick" | "fading";

/** How the pet moves: only a healthy Monster is aggressive. */
export function petMood(view: PetView): PetMood {
  if (view.stage === "egg") return "egg";
  if (view.healthState === "fading") return "fading";
  if (view.healthState === "sick") return "sick";
  return view.stage === "monster" ? "aggressive" : "cute";
}

/** One line about how the pet is doing, for the Home card. */
export function petStatusLine(view: PetView): string {
  if (view.species === null) {
    return view.diedAt ? "Your pet passed away. Pick a new egg." : "Pick an egg to start.";
  }
  if (view.stage === "egg") {
    return `Day ${view.eggStreakDays} of ${view.eggHatchDays}. Open Zoption daily to hatch it.`;
  }
  if (view.healthState === "fading") return "Fading fast. Log something to save it.";
  if (view.healthState === "sick") return "Feeling sick. Log something to heal it.";
  if (view.nextStagePoints === null) return `${view.points} points. Fully grown.`;
  return `${view.points} of ${view.nextStagePoints} points to grow.`;
}
