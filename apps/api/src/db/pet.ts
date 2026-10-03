import {
  applyPetEvent,
  emptyPetState,
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  PET_ASSISTANT_MIN_MESSAGE_LENGTH,
  PET_EGG_HATCH_DAYS,
  PET_STAGE_THRESHOLDS,
  petEggStreakOn,
  petHealthAt,
  petLocalDate,
  petStageForPoints,
  petStateAt,
  petStoredStateSchema,
  startPetEgg,
  type PetEarningAction,
  type PetEvent,
  type PetSpecies,
  type PetState,
  type PetView,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface PetRepository {
  /** The pet as of `now`, after crediting activity recorded since the last read. */
  get(env: Bindings, tenantId: string, now: Date): Promise<PetView>;
  /** Records that the app was opened: the login that hatches eggs and earns the daily 10 points. */
  checkIn(env: Bindings, tenantId: string, now: Date): Promise<PetView>;
  /** Picks a new egg. Only allowed while there is no living pet. */
  chooseEgg(env: Bindings, tenantId: string, species: PetSpecies, now: Date): Promise<PetView>;
  setEnabled(env: Bindings, tenantId: string, enabled: boolean, now: Date): Promise<PetView>;
}

interface PetRow {
  enabled: number;
  stateJson: string;
  processedThrough: string;
}

interface StoredPet {
  enabled: boolean;
  state: PetState;
  processedThrough: string;
}

/**
 * Qualifying activity created in (?2, ?3]. Imports, subscription renewals, opening balances, and a
 * transaction repeated within ten minutes earn nothing; a transaction must be dated within a day of
 * when it was entered. Deleted rows still count, so deleting never refunds and re-adding hits the
 * same daily cap. Binds: ?1 tenant, ?2 from, ?3 through, ?4 opening balance key, ?5 message length.
 */
const ACTIVITY_SINCE = `
  SELECT t.created_at AS at, t.id AS id,
    CASE WHEN t.debt_id IS NOT NULL THEN 'debt_payment' ELSE 'transaction' END AS action
  FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.tenant_id = ?1 AND t.source_kind = 'manual' AND t.subscription_id IS NULL
    AND t.amount_minor <> 0 AND (t.kind <> 'transfer' OR t.debt_id IS NOT NULL)
    AND c.system_key IS NOT ?4
    AND julianday(t.created_at) > julianday(?2) AND julianday(t.created_at) <= julianday(?3)
    AND abs(julianday(t.date) - julianday(date(t.created_at, '+8 hours'))) <= 1
    AND NOT EXISTS (
      SELECT 1 FROM transactions d
      WHERE d.tenant_id = ?1 AND d.id <> t.id AND d.account_id IS t.account_id
        AND d.amount_minor = t.amount_minor AND d.category_id IS t.category_id
        AND lower(trim(d.description)) = lower(trim(t.description))
        AND julianday(d.created_at) >= julianday(t.created_at) - 600.0 / 86400
        AND (julianday(d.created_at) < julianday(t.created_at)
          OR (julianday(d.created_at) = julianday(t.created_at) AND d.id < t.id)))
  UNION ALL
  SELECT s.created_at, s.id, 'subscription'
  FROM subscriptions s
  WHERE s.tenant_id = ?1 AND s.amount_minor > 0
    AND julianday(s.created_at) > julianday(?2) AND julianday(s.created_at) <= julianday(?3)
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions e
      WHERE e.tenant_id = ?1 AND e.id <> s.id AND lower(trim(e.name)) = lower(trim(s.name))
        AND (julianday(e.created_at) < julianday(s.created_at)
          OR (julianday(e.created_at) = julianday(s.created_at) AND e.id < s.id)))
  UNION ALL
  SELECT a.created_at, a.id, 'assistant'
  FROM assistant_messages a JOIN assistant_messages u ON u.id = a.reply_to_message_id
  WHERE a.tenant_id = ?1 AND u.tenant_id = ?1 AND a.role = 'assistant' AND a.status = 'completed'
    AND u.role = 'user' AND length(trim(u.content)) >= ?5
    AND julianday(a.created_at) > julianday(?2) AND julianday(a.created_at) <= julianday(?3)
  ORDER BY 1, 2`;

/** D1 rows hold either `datetime('now')` text or ISO strings; both are UTC. */
function parseTimestamp(value: string): number {
  return Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

/**
 * Activity is credited only through the last whole second, because `datetime('now')` rounds down:
 * a row written later in the current second could otherwise land behind the cursor.
 */
function creditedThrough(now: Date): string {
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - 1000).toISOString();
}

async function load(env: Bindings, tenantId: string): Promise<StoredPet | null> {
  const row = await env.DB.prepare(
    `SELECT enabled, state_json AS stateJson, processed_through AS processedThrough
     FROM pets WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<PetRow>();
  if (!row) return null;
  return {
    enabled: row.enabled === 1,
    state: petStoredStateSchema.parse(JSON.parse(row.stateJson)),
    processedThrough: row.processedThrough,
  };
}

async function save(env: Bindings, tenantId: string, pet: StoredPet): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pets (tenant_id, enabled, state_json, processed_through, updated_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))
     ON CONFLICT (tenant_id) DO UPDATE SET enabled = ?2, state_json = ?3,
       processed_through = ?4, updated_at = datetime('now')`,
  )
    .bind(tenantId, pet.enabled ? 1 : 0, JSON.stringify(pet.state), pet.processedThrough)
    .run();
}

/** A new workspace starts enabled with no egg, crediting nothing from before it existed. */
function fresh(now: Date): StoredPet {
  return { enabled: true, state: emptyPetState, processedThrough: creditedThrough(now) };
}

/**
 * Replays the activity recorded since the cursor. A disabled pet credits nothing and its clock
 * is paused, so the cursor just moves on.
 */
async function catchUp(env: Bindings, tenantId: string, pet: StoredPet, now: Date) {
  const through = creditedThrough(now);
  if (!pet.enabled || pet.state.species === null) return { ...pet, processedThrough: through };
  const { results } = await env.DB.prepare(ACTIVITY_SINCE)
    .bind(
      tenantId,
      pet.processedThrough,
      through,
      OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
      PET_ASSISTANT_MIN_MESSAGE_LENGTH,
    )
    .all<{ at: string; action: PetEarningAction }>();
  const events: PetEvent[] = results.map((row) => ({
    action: row.action,
    occurredAt: parseTimestamp(row.at),
  }));
  // The UNION sorts text, and the two timestamp formats do not sort together.
  events.sort((a, b) => a.occurredAt - b.occurredAt);
  const state = events.reduce(applyPetEvent, pet.state);
  return { ...pet, state: petStateAt(state, now.getTime()), processedThrough: through };
}

function toView(pet: StoredPet, now: Date): PetView {
  const { state } = pet;
  const at = now.getTime();
  const today = petLocalDate(at);
  const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
  const base = {
    enabled: pet.enabled,
    species: state.species,
    diedAt: iso(state.diedAt),
    eggHatchDays: PET_EGG_HATCH_DAYS,
  };
  if (state.hatchedAt === null || state.lastActivityAt === null) {
    return {
      ...base,
      stage: "egg",
      points: 0,
      nextStagePoints: null,
      pointsToday: 0,
      eggStreakDays: petEggStreakOn(state.eggStreak, today),
      health: null,
      healthState: null,
      lastActivityAt: null,
    };
  }
  const stage = petStageForPoints(state.points);
  const next = { baby: "juvenile", juvenile: "adult", adult: "monster", monster: null } as const;
  const nextStage = next[stage];
  // A disabled pet's clock is paused, so it shows the health it had when it was turned off.
  const health = petHealthAt(state.lastActivityAt, pet.enabled ? at : state.lastActivityAt);
  return {
    ...base,
    stage,
    points: state.points,
    nextStagePoints: nextStage === null ? null : PET_STAGE_THRESHOLDS[nextStage],
    pointsToday:
      state.day?.date === today
        ? state.day.entries.reduce(
            (sum, entry) => (entry.action === "heal" ? sum : sum + entry.points),
            0,
          )
        : 0,
    eggStreakDays: PET_EGG_HATCH_DAYS,
    health: health.health,
    healthState: health.state,
    lastActivityAt: iso(state.lastActivityAt),
  };
}

async function current(env: Bindings, tenantId: string, now: Date): Promise<StoredPet> {
  const stored = (await load(env, tenantId)) ?? fresh(now);
  return catchUp(env, tenantId, stored, now);
}

export const petRepository: PetRepository = {
  async get(env, tenantId, now) {
    const pet = await current(env, tenantId, now);
    await save(env, tenantId, pet);
    return toView(pet, now);
  },

  async checkIn(env, tenantId, now) {
    let pet = await current(env, tenantId, now);
    if (pet.enabled) {
      pet = {
        ...pet,
        state: applyPetEvent(pet.state, { action: "login", occurredAt: now.getTime() }),
      };
    }
    await save(env, tenantId, pet);
    return toView(pet, now);
  },

  async chooseEgg(env, tenantId, species, now) {
    const pet = await current(env, tenantId, now);
    if (pet.state.species !== null) {
      throw new HttpError(409, "pet_exists", "You already have a pet.");
    }
    const next = { ...pet, enabled: true, state: startPetEgg(species) };
    await save(env, tenantId, next);
    return toView(next, now);
  },

  async setEnabled(env, tenantId, enabled, now) {
    const pet = await current(env, tenantId, now);
    let state = pet.state;
    // Turning the pet back on restarts its 24 hour clock instead of counting the paused time.
    if (enabled && !pet.enabled && state.lastActivityAt !== null) {
      state = { ...state, lastActivityAt: now.getTime() };
    }
    const next = { ...pet, enabled, state };
    await save(env, tenantId, next);
    return toView(next, now);
  },
};
