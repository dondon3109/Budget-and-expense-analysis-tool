/**
 * Pet companion rules shared by the Worker (which owns the ledger and re-checks every cap) and the
 * mobile client (which previews the same answer offline). Dates are the user's local calendar day
 * as `YYYY-MM-DD`; times are epoch milliseconds.
 */

// The pet enums live here rather than in types.ts, which is at its line limit.
export const petSpecies = ["hedgehog", "pig", "hamster", "penguin", "panda", "hippo"] as const;
export type PetSpecies = (typeof petSpecies)[number];

export const petStages = ["egg", "baby", "juvenile", "adult", "monster"] as const;
export type PetStage = (typeof petStages)[number];

/** Activities in the points ledger. `variety_bonus` and `heal` are written by the rules, never by a client. */
export const petActivityActions = [
  "login",
  "transaction",
  "subscription",
  "debt_payment",
  "assistant",
  "variety_bonus",
  "heal",
] as const;
export type PetActivityAction = (typeof petActivityActions)[number];

export const petHealthStates = ["healthy", "sick", "fading", "dead"] as const;
export type PetHealthState = (typeof petHealthStates)[number];

/** Actions a user performs. The rules add `variety_bonus` and `heal` rows themselves. */
export type PetEarningAction = Exclude<PetActivityAction, "variety_bonus" | "heal">;

/** Points per action and how many of that action count per local day. */
export const PET_ACTION_RULES: Record<PetEarningAction, { points: number; dailyCount: number }> = {
  login: { points: 10, dailyCount: 1 },
  transaction: { points: 10, dailyCount: 3 },
  subscription: { points: 15, dailyCount: 2 },
  debt_payment: { points: 20, dailyCount: 2 },
  assistant: { points: 5, dailyCount: 3 },
};

export const PET_VARIETY_BONUS_POINTS = 10;
/** Distinct earning actions in one day that unlock the variety bonus. */
export const PET_VARIETY_BONUS_ACTION_TYPES = 3;
/** No day earns more than this, bonus included. */
export const PET_DAILY_POINT_CEILING = 100;
/** Assistant messages shorter than this earn nothing. */
export const PET_ASSISTANT_MIN_MESSAGE_LENGTH = 15;

/** Consecutive login days an egg needs; a missed day starts the count again. */
export const PET_EGG_HATCH_DAYS = 7;

/** Points since hatch at which each hatched stage begins. */
export const PET_STAGE_THRESHOLDS: Record<Exclude<PetStage, "egg">, number> = {
  baby: 0,
  juvenile: 350,
  adult: 1_000,
  monster: 5_500,
};

export const PET_MAX_HEALTH = 100;
const HOUR_MS = 60 * 60 * 1000;
/** Hours without activity before sickness starts, fading starts, and the pet dies. */
export const PET_SICK_AFTER_HOURS = 24;
export const PET_FADING_AFTER_HOURS = 48;
export const PET_DEAD_AFTER_HOURS = 72;

/** One points row on a single local day. */
export interface PetLedgerEntry {
  action: PetActivityAction;
  points: number;
}

/** The rows to append for one action, given the rows already earned that local day. */
export function petAwardRows(
  dayEntries: readonly PetLedgerEntry[],
  action: PetEarningAction,
): PetLedgerEntry[] {
  const rule = PET_ACTION_RULES[action];
  const alreadyCounted = dayEntries.filter((entry) => entry.action === action).length;
  if (alreadyCounted >= rule.dailyCount) return [];

  let dayTotal = dayEntries.reduce(
    (sum, entry) => (entry.action === "heal" ? sum : sum + entry.points),
    0,
  );
  const rows: PetLedgerEntry[] = [];
  // The row is kept even when the ceiling leaves 0 points, so caps and variety still see it.
  const points = Math.min(rule.points, Math.max(0, PET_DAILY_POINT_CEILING - dayTotal));
  rows.push({ action, points });
  dayTotal += points;

  const hasBonus = dayEntries.some((entry) => entry.action === "variety_bonus");
  const actionTypes = new Set(
    [...dayEntries, ...rows]
      .map((entry) => entry.action)
      .filter((entryAction) => entryAction !== "variety_bonus" && entryAction !== "heal"),
  );
  if (!hasBonus && actionTypes.size >= PET_VARIETY_BONUS_ACTION_TYPES) {
    const bonus = Math.min(
      PET_VARIETY_BONUS_POINTS,
      Math.max(0, PET_DAILY_POINT_CEILING - dayTotal),
    );
    rows.push({ action: "variety_bonus", points: bonus });
  }
  return rows;
}

/** The hatched stage for a points total. Points never fall below the current stage (see heal). */
export function petStageForPoints(points: number): Exclude<PetStage, "egg"> {
  if (points >= PET_STAGE_THRESHOLDS.monster) return "monster";
  if (points >= PET_STAGE_THRESHOLDS.adult) return "adult";
  if (points >= PET_STAGE_THRESHOLDS.juvenile) return "juvenile";
  return "baby";
}

function dayNumber(localDate: string): number {
  return Date.parse(`${localDate}T00:00:00Z`) / (24 * HOUR_MS);
}

export interface PetEggStreak {
  /** Consecutive login days so far, 0 before the first. */
  streakDays: number;
  /** The last local day the app was opened, or null before the first open. */
  lastLoginDate: string | null;
}

/** The egg streak after a login on `today`. Logging in twice on one day changes nothing. */
export function petEggStreakAfterLogin(streak: PetEggStreak, today: string): PetEggStreak {
  if (streak.lastLoginDate === today) return streak;
  const continues =
    streak.lastLoginDate !== null && dayNumber(today) - dayNumber(streak.lastLoginDate) === 1;
  return { streakDays: continues ? streak.streakDays + 1 : 1, lastLoginDate: today };
}

/** The streak to show on `today`: a whole missed day means it has already reset to 0. */
export function petEggStreakOn(streak: PetEggStreak, today: string): number {
  if (streak.lastLoginDate === null) return 0;
  return dayNumber(today) - dayNumber(streak.lastLoginDate) <= 1 ? streak.streakDays : 0;
}

export function petEggHatches(streak: PetEggStreak): boolean {
  return streak.streakDays >= PET_EGG_HATCH_DAYS;
}

export interface PetHealth {
  state: PetHealthState;
  /** 0 to 100. Full until 24 hours, then falls evenly to 0 at 72 hours. */
  health: number;
}

/** A hatched pet's health `now`, from the time of its last qualifying activity. */
export function petHealthAt(lastActivityAt: number, now: number): PetHealth {
  const hours = Math.max(0, now - lastActivityAt) / HOUR_MS;
  if (hours >= PET_DEAD_AFTER_HOURS) return { state: "dead", health: 0 };
  if (hours < PET_SICK_AFTER_HOURS) return { state: "healthy", health: PET_MAX_HEALTH };
  const health = Math.ceil(
    (PET_MAX_HEALTH * (PET_DEAD_AFTER_HOURS - hours)) /
      (PET_DEAD_AFTER_HOURS - PET_SICK_AFTER_HOURS),
  );
  return { state: hours < PET_FADING_AFTER_HOURS ? "sick" : "fading", health };
}

/**
 * Points the pet eats to refill its health: one point per missing health point, but never enough
 * to take the total below the current stage's threshold. Below that it heals for free, so a young
 * pet always recovers and no pet is ever demoted.
 */
export function petHealCost(health: number, points: number): number {
  const missing = Math.max(0, PET_MAX_HEALTH - health);
  const floor = PET_STAGE_THRESHOLDS[petStageForPoints(points)];
  return Math.min(missing, Math.max(0, points - floor));
}

const MANILA_OFFSET_MS = 8 * HOUR_MS;

/** The Manila calendar date of an instant. Like billing dates, pet days follow Manila time. */
export function petLocalDate(at: number): string {
  return new Date(at + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Everything needed to replay the pet from its stored state and new events. */
export interface PetState {
  /** Null before the user picks an egg, and again after the pet dies. */
  species: PetSpecies | null;
  eggStreak: PetEggStreak;
  /** When the egg hatched; null while it is an egg. */
  hatchedAt: number | null;
  /** Points since hatch, after healing. */
  points: number;
  /** The last activity that earned a ledger row; the health clock runs from here. */
  lastActivityAt: number | null;
  /** The rows earned on the current Manila day, for the daily caps. */
  day: { date: string; entries: PetLedgerEntry[] } | null;
  /** When the last pet died, for the memorial. Cleared when a new egg is picked. */
  diedAt: number | null;
}

export interface PetEvent {
  action: PetEarningAction;
  occurredAt: number;
}

export const emptyPetState: PetState = {
  species: null,
  eggStreak: { streakDays: 0, lastLoginDate: null },
  hatchedAt: null,
  points: 0,
  lastActivityAt: null,
  day: null,
  diedAt: null,
};

/** A fresh egg of the chosen species. */
export function startPetEgg(species: PetSpecies): PetState {
  return { ...emptyPetState, species };
}

/** The state as of `now`: a hatched pet left alone for 72 hours has died. */
export function petStateAt(state: PetState, now: number): PetState {
  if (state.species === null || state.hatchedAt === null || state.lastActivityAt === null) {
    return state;
  }
  if (petHealthAt(state.lastActivityAt, now).state !== "dead") return state;
  return { ...emptyPetState, diedAt: state.lastActivityAt + PET_DEAD_AFTER_HOURS * HOUR_MS };
}

/**
 * Applies one event, in time order. An egg only counts logins toward hatching. A hatched pet earns
 * the capped points, then eats points to refill the health it lost since its last activity.
 */
export function applyPetEvent(previous: PetState, event: PetEvent): PetState {
  const state = petStateAt(previous, event.occurredAt);
  if (state.species === null) return state;

  const date = petLocalDate(event.occurredAt);
  if (state.hatchedAt === null) {
    if (event.action !== "login") return state;
    const eggStreak = petEggStreakAfterLogin(state.eggStreak, date);
    if (!petEggHatches(eggStreak)) return { ...state, eggStreak };
    return {
      ...state,
      eggStreak,
      hatchedAt: event.occurredAt,
      points: 0,
      lastActivityAt: event.occurredAt,
      // The hatching login is that day's login.
      day: { date, entries: [{ action: "login", points: 0 }] },
    };
  }

  const dayEntries = state.day?.date === date ? state.day.entries : [];
  const rows = petAwardRows(dayEntries, event.action);
  if (rows.length === 0) return state;

  const { health } = petHealthAt(state.lastActivityAt ?? event.occurredAt, event.occurredAt);
  const earned = state.points + rows.reduce((sum, row) => sum + row.points, 0);
  const healCost = petHealCost(health, earned);
  const entries = [...dayEntries, ...rows];
  if (healCost > 0) entries.push({ action: "heal", points: -healCost });
  return {
    ...state,
    points: earned - healCost,
    lastActivityAt: event.occurredAt,
    day: { date, entries },
  };
}
