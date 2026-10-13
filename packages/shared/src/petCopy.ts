import { PET_ACTION_RULES, type PetSpecies, type PetStage } from "./pet";
import type { PetMoment } from "./petMoment";
import type { PetSeen, PetView } from "./schemas/pet";

// Pet wording both clients render, so web and mobile describe the pet the same way.

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
  legend: "Legend",
};

/** How each action earns points, in the order the pet page lists them. */
export const petEarningRows = [
  { label: "Open Zoption", rule: PET_ACTION_RULES.login },
  { label: "Log a transaction", rule: PET_ACTION_RULES.transaction },
  { label: "Add a subscription", rule: PET_ACTION_RULES.subscription },
  { label: "Pay a debt", rule: PET_ACTION_RULES.debt_payment },
  { label: "Chat with the AI Assistant", rule: PET_ACTION_RULES.assistant },
] as const;

/** One line about how the pet is doing. */
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

/**
 * The pet pop-up's title and message. A dead pet's view no longer names it, so `before` (what the
 * device showed last) supplies the species.
 */
export function petMomentCopy(
  moment: PetMoment,
  view: PetView,
  before: PetSeen | null,
): { title: string; body: string } {
  if (view.species === null) {
    const name = before?.species ? petSpeciesLabels[before.species].toLowerCase() : "pet";
    return moment === "died"
      ? {
          title: `Your ${name} passed away`,
          body: "Three days went by with nothing logged. Pick a new egg to start again.",
        }
      : { title: "A new egg is waiting", body: petStatusLine(view) };
  }
  const name = petSpeciesLabels[view.species].toLowerCase();
  const stage = petStageLabels[view.stage];
  if (moment === "hatched") {
    return {
      title: `Your ${name} egg hatched!`,
      body: "Say hi to your baby. Log money each day to help it grow.",
    };
  }
  if (moment === "grew") {
    return {
      title: `Your ${name} is now ${view.stage === "adult" ? "an" : "a"} ${stage}!`,
      body:
        view.stage === "legend"
          ? "It reached its final form. Keep logging to keep it healthy."
          : petStatusLine(view),
    };
  }
  if (moment === "sick") {
    return view.healthState === "fading"
      ? {
          title: `Your ${name} is fading`,
          body: "Log something soon, or it passes away three days after your last activity.",
        }
      : { title: `Your ${name} is sick`, body: "Log something today and it heals." };
  }
  return { title: `${petSpeciesLabels[view.species]} · ${stage}`, body: petStatusLine(view) };
}
