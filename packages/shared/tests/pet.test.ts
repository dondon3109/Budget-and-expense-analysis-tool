import { describe, expect, it } from "vitest";

import {
  applyPetEvent,
  emptyPetState,
  petAwardRows,
  petEggHatches,
  petEggStreakAfterLogin,
  petEggStreakOn,
  petHealCost,
  petHealthAt,
  petLocalDate,
  petStateAt,
  startPetEgg,
  petStageForPoints,
  type PetEarningAction,
  type PetEggStreak,
  type PetLedgerEntry,
  type PetState,
} from "../src/pet";

function earnAll(actions: PetEarningAction[]): PetLedgerEntry[] {
  return actions.reduce<PetLedgerEntry[]>(
    (day, action) => [...day, ...petAwardRows(day, action)],
    [],
  );
}

const total = (rows: PetLedgerEntry[]) => rows.reduce((sum, row) => sum + row.points, 0);

describe("petAwardRows", () => {
  it("awards an action's points until its daily count is used up", () => {
    const day = earnAll(Array<PetEarningAction>(5).fill("transaction"));
    expect(day).toEqual([
      { action: "transaction", points: 10 },
      { action: "transaction", points: 10 },
      { action: "transaction", points: 10 },
    ]);
  });

  it("counts a login once a day", () => {
    expect(total(earnAll(["login", "login"]))).toBe(10);
  });

  it("adds the variety bonus once, on the third distinct action type", () => {
    const day = earnAll(["login", "transaction", "transaction", "assistant", "debt_payment"]);
    expect(day.filter((row) => row.action === "variety_bonus")).toEqual([
      { action: "variety_bonus", points: 10 },
    ]);
    expect(day.findIndex((row) => row.action === "variety_bonus")).toBe(4);
  });

  it("never lets a day pass the 100 point ceiling", () => {
    const day = earnAll([
      "login",
      ...Array<PetEarningAction>(3).fill("transaction"),
      ...Array<PetEarningAction>(2).fill("subscription"),
      ...Array<PetEarningAction>(2).fill("debt_payment"),
      ...Array<PetEarningAction>(3).fill("assistant"),
    ]);
    expect(total(day)).toBe(100);
  });

  it("ignores heal rows when measuring the ceiling", () => {
    const day: PetLedgerEntry[] = [
      { action: "login", points: 10 },
      { action: "heal", points: -60 },
    ];
    expect(petAwardRows(day, "transaction")).toEqual([{ action: "transaction", points: 10 }]);
  });
});

describe("petStageForPoints", () => {
  it.each([
    [0, "baby"],
    [349, "baby"],
    [350, "juvenile"],
    [999, "juvenile"],
    [1_000, "adult"],
    [5_499, "adult"],
    [5_500, "monster"],
  ] as const)("puts %i points at %s", (points, stage) => {
    expect(petStageForPoints(points)).toBe(stage);
  });
});

describe("egg streak", () => {
  const start: PetEggStreak = { streakDays: 0, lastLoginDate: null };

  it("hatches after seven consecutive days, across a month boundary", () => {
    const dates = [
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ];
    const streak = dates.reduce(petEggStreakAfterLogin, start);
    expect(streak).toEqual({ streakDays: 7, lastLoginDate: "2026-11-03" });
    expect(petEggHatches(streak)).toBe(true);
  });

  it("counts a second login on the same day once", () => {
    const once = petEggStreakAfterLogin(start, "2026-10-03");
    expect(petEggStreakAfterLogin(once, "2026-10-03")).toBe(once);
  });

  it("starts again at 1 after a missed day", () => {
    const streak = { streakDays: 5, lastLoginDate: "2026-10-03" };
    expect(petEggStreakAfterLogin(streak, "2026-10-05")).toEqual({
      streakDays: 1,
      lastLoginDate: "2026-10-05",
    });
  });

  it("shows 0 once a whole day has been missed, before the next login", () => {
    const streak = { streakDays: 5, lastLoginDate: "2026-10-03" };
    expect(petEggStreakOn(streak, "2026-10-04")).toBe(5);
    expect(petEggStreakOn(streak, "2026-10-05")).toBe(0);
    expect(petEggStreakOn(start, "2026-10-05")).toBe(0);
  });
});

describe("petHealthAt", () => {
  const hour = 60 * 60 * 1000;

  it.each([
    [0, "healthy", 100],
    [23.9, "healthy", 100],
    [24, "sick", 100],
    [36, "sick", 75],
    [48, "fading", 50],
    [60, "fading", 25],
    [71.99, "fading", 1],
    [72, "dead", 0],
  ] as const)("at %d hours is %s with %i health", (hours, state, health) => {
    expect(petHealthAt(0, hours * hour)).toEqual({ state, health });
  });
});

describe("petHealCost", () => {
  it("costs one point per missing health point", () => {
    expect(petHealCost(25, 2_420)).toBe(75);
  });

  it("is free at full health", () => {
    expect(petHealCost(100, 2_420)).toBe(0);
  });

  it("never takes the total below the current stage's threshold", () => {
    expect(petHealCost(0, 1_030)).toBe(30);
    expect(petHealCost(0, 40)).toBe(40);
    expect(petHealCost(0, 0)).toBe(0);
  });
});

describe("applyPetEvent", () => {
  const hour = 60 * 60 * 1000;
  // 2026-10-03 09:00 in Manila.
  const t0 = Date.UTC(2026, 9, 3, 1);
  const login = (occurredAt: number) => ({ action: "login" as const, occurredAt });

  function hatched(): PetState {
    let state = startPetEgg("panda");
    for (let day = 0; day < 7; day += 1) state = applyPetEvent(state, login(t0 + day * 24 * hour));
    return state;
  }

  it("uses Manila dates", () => {
    expect(petLocalDate(Date.UTC(2026, 9, 3, 16))).toBe("2026-10-04");
    expect(petLocalDate(Date.UTC(2026, 9, 3, 15, 59))).toBe("2026-10-03");
  });

  it("ignores everything until an egg is picked", () => {
    expect(applyPetEvent(emptyPetState, login(t0))).toBe(emptyPetState);
  });

  it("hatches on the seventh consecutive login day with no points carried over", () => {
    let state = startPetEgg("panda");
    state = applyPetEvent(state, { action: "transaction", occurredAt: t0 });
    expect(state.eggStreak.streakDays).toBe(0);
    state = hatched();
    expect(state.hatchedAt).toBe(t0 + 6 * 24 * hour);
    expect(state.points).toBe(0);
  });

  it("keeps an egg forever, however long it waits", () => {
    const egg = applyPetEvent(startPetEgg("pig"), login(t0));
    expect(petStateAt(egg, t0 + 30 * 24 * hour)).toBe(egg);
  });

  it("earns capped points on a hatched pet", () => {
    let state = hatched();
    const later = (state.hatchedAt ?? 0) + hour;
    for (let i = 0; i < 5; i += 1) {
      state = applyPetEvent(state, { action: "transaction", occurredAt: later + i });
    }
    expect(state.points).toBe(30);
  });

  it("eats points to heal after a long absence", () => {
    let state = { ...hatched(), points: 2_400 };
    const back = (state.lastActivityAt ?? 0) + 60 * hour;
    state = applyPetEvent(state, { action: "transaction", occurredAt: back });
    expect(state.points).toBe(2_410 - 75);
    expect(state.day?.entries.at(-1)).toEqual({ action: "heal", points: -75 });
  });

  it("dies after 72 hours and waits for a new egg", () => {
    const state = hatched();
    const dead = applyPetEvent(state, login((state.lastActivityAt ?? 0) + 72 * hour));
    expect(dead).toEqual({ ...emptyPetState, diedAt: (state.lastActivityAt ?? 0) + 72 * hour });
  });
});
