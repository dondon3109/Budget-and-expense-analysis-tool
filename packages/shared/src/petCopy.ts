import {
  PET_ACTION_RULES,
  PET_DEAD_AFTER_HOURS,
  PET_FADING_AFTER_HOURS,
  PET_HATCH_TAPS,
  PET_SICK_AFTER_HOURS,
  petHealCost,
  petStageForPoints,
  type PetColor,
  type PetSpecies,
  type PetStage,
} from "./pet";
import type { PetMoment } from "./petMoment";
import type { PetView } from "./schemas/pet";

// Pet wording both clients render, so web and mobile describe the pet the same way.

export const petSpeciesLabels: Record<PetSpecies, string> = {
  hedgehog: "Hedgehog",
  pig: "Pig",
  hamster: "Hamster",
  penguin: "Penguin",
  panda: "Panda",
  hippo: "Hippo",
};

export const petColorLabels: Record<PetColor, string> = {
  original: "Original",
  pink: "Pink",
  mint: "Mint",
  sky: "Sky",
  lilac: "Lilac",
  peach: "Peach",
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
  { label: "Open Zoption", emoji: "👋", rule: PET_ACTION_RULES.login },
  { label: "Log a transaction", emoji: "🧾", rule: PET_ACTION_RULES.transaction },
  { label: "Add a subscription", emoji: "📅", rule: PET_ACTION_RULES.subscription },
  { label: "Pay a debt", emoji: "💸", rule: PET_ACTION_RULES.debt_payment },
  { label: "Chat with the AI Assistant", emoji: "💬", rule: PET_ACTION_RULES.assistant },
] as const;

/** The badge each stage wears on the pet page's growth path. */
export const petStageEmoji: Record<PetStage, string> = {
  egg: "🥚",
  baby: "🐣",
  juvenile: "🌱",
  adult: "⭐",
  legend: "👑",
};

/** One line about how the pet is doing. */
export function petStatusLine(view: PetView): string {
  if (view.species === null) {
    return view.diedAt ? "Your pet passed away. Pick a new egg." : "Pick an egg to start.";
  }
  if (view.stage === "egg") {
    if (view.eggStreakDays >= view.eggHatchDays)
      return "Ready to hatch. Tap the egg to crack it open.";
    return `Day ${view.eggStreakDays} of ${view.eggHatchDays}. Open Zoption daily to hatch it.`;
  }
  if (view.healthState === "fading") return "Fading fast. Log something to save it.";
  if (view.healthState === "sick") return "Feeling sick. Log something to heal it.";
  if (view.nextStagePoints === null) return `${view.points} points. Fully grown.`;
  return `${view.points} of ${view.nextStagePoints} points to grow.`;
}

/**
 * Why a pet without a paid plan stops short of its next stage (see `petFreePointsCap`), or null for a
 * Legend or an egg. Clients show it only once they know the plan is Free; the Worker enforces it.
 */
export function petGrowthLockedLine(view: PetView): string | null {
  if (view.stage === "egg" || view.nextStagePoints === null) return null;
  const next = petStageForPoints(view.nextStagePoints);
  return `Growing into ${next === "adult" ? "an" : "a"} ${petStageLabels[next]} needs a paid plan.`;
}

/** The pet pop-up's title and message. */
export function petMomentCopy(moment: PetMoment, view: PetView): { title: string; body: string } {
  if (view.species === null) {
    if (moment === "died") {
      return {
        title: `${view.name ?? "Your pet"} passed away`,
        body: "Three days went by with nothing logged. Pick a new egg to start again.",
      };
    }
    return view.diedAt
      ? {
          title: "Ready for a new egg",
          body: `${view.name ?? "Your last pet"} passed away. Pick a new egg whenever you're ready.`,
        }
      : { title: "A new egg is waiting", body: petStatusLine(view) };
  }
  const name = view.name ?? petSpeciesLabels[view.species];
  const stage = petStageLabels[view.stage];
  if (moment === "ready") {
    return {
      title: `${name}'s egg is ready to hatch!`,
      body: `Seven days in a row did it. Tap the egg ${PET_HATCH_TAPS} times to crack it open.`,
    };
  }
  if (moment === "grew") {
    return {
      title: `${name} is now ${view.stage === "adult" ? "an" : "a"} ${stage}!`,
      body:
        view.stage === "legend"
          ? "It reached its final form. Keep logging to keep it healthy."
          : petStatusLine(view),
    };
  }
  if (moment === "sick") {
    return view.healthState === "fading"
      ? {
          title: `${name} is fading`,
          body: "Log something soon, or it passes away three days after your last activity.",
        }
      : { title: `${name} is sick`, body: "Log something today and it heals." };
  }
  return { title: `${name} · ${stage}`, body: petStatusLine(view) };
}

const HOUR_MS = 60 * 60 * 1000;

/** Concise streak guidance for an egg that is not ready to hatch yet. */
export function petEggProgressLine(view: PetView): string | null {
  if (view.species === null || view.stage !== "egg") return null;
  if (view.eggStreakDays >= view.eggHatchDays) return "Ready to hatch.";
  if (view.eggStreakDays === 0) {
    return `Open Zoption today to start your ${view.eggHatchDays}-day streak. Missing a day starts over.`;
  }
  const left = view.eggHatchDays - view.eggStreakDays;
  return `${view.eggStreakDays}-day streak active. Open Zoption ${left === 1 ? "tomorrow" : `for ${left} more days`} to hatch it. Missing a day starts over.`;
}

/**
 * How long a hatched pet's health stays full, or what it needs to heal right now (cost and time
 * left before fading or passing away).
 */
export function petHealthHint(view: PetView, nowMs = Date.now()): string | null {
  if (view.species === null || view.stage === "egg" || view.health === null) return null;
  const elapsedHours =
    view.lastActivityAt === null
      ? null
      : Math.max(0, nowMs - Date.parse(view.lastActivityAt)) / HOUR_MS;
  if (view.healthState === "healthy") {
    if (elapsedHours === null || !Number.isFinite(elapsedHours)) {
      return "Stays full for 24h after each activity.";
    }
    const left = Math.max(1, Math.ceil(PET_SICK_AFTER_HOURS - elapsedHours));
    return `Full for 24h after activity · drops in ~${left}h.`;
  }
  const cost = petHealCost(view.health, view.points);
  const heal =
    cost > 0
      ? `Costs ${cost} pts to heal on your next activity (never drops below your stage).`
      : "Heals free on your next activity.";
  if (elapsedHours === null || !Number.isFinite(elapsedHours)) return heal;
  if (view.healthState === "sick") {
    const left = Math.max(1, Math.ceil(PET_FADING_AFTER_HOURS - elapsedHours));
    return `${heal} Fading starts in ~${left}h.`;
  }
  const left = Math.max(1, Math.ceil(PET_DEAD_AFTER_HOURS - elapsedHours));
  return `${heal} Log something within ~${left}h or it passes away.`;
}
