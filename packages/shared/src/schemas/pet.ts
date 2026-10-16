// Pet companion: the stored replay state and the view every client renders.

import { z } from "zod";

import {
  PET_NAME_MAX_LENGTH,
  petActivityActions,
  petColors,
  petHealthStates,
  petSpecies,
  petStages,
} from "../pet";
import { isoDateSchema } from "./common";

const epochMsSchema = z.number().int().nonnegative();

/** A pet name: trimmed, one to PET_NAME_MAX_LENGTH characters. */
export const petNameSchema = z.string().trim().min(1).max(PET_NAME_MAX_LENGTH);

/** The stored `PetState` (see pet.ts), read back from D1 as JSON. */
export const petStoredStateSchema = z
  .object({
    species: z.enum(petSpecies).nullable(),
    // Pets stored before names existed have none; the view falls back to the species label.
    name: petNameSchema.nullable().default(null),
    // Pets stored before colors existed have none until the user picks one.
    color: z.enum(petColors).nullable().default(null),
    eggStreak: z
      .object({
        streakDays: z.number().int().nonnegative(),
        lastLoginDate: isoDateSchema.nullable(),
      })
      .strict(),
    hatchedAt: epochMsSchema.nullable(),
    points: z.number().int().nonnegative(),
    lastActivityAt: epochMsSchema.nullable(),
    day: z
      .object({
        date: isoDateSchema,
        entries: z.array(
          z.object({ action: z.enum(petActivityActions), points: z.number().int() }).strict(),
        ),
      })
      .strict()
      .nullable(),
    diedAt: epochMsSchema.nullable(),
  })
  .strict();

export const petEggChoiceSchema = z
  .object({ species: z.enum(petSpecies), name: petNameSchema, color: z.enum(petColors) })
  .strict();
export type PetEggChoice = z.infer<typeof petEggChoiceSchema>;

export const petColorChoiceSchema = z.object({ color: z.enum(petColors) }).strict();
export type PetColorChoice = z.infer<typeof petColorChoiceSchema>;

export const petSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export type PetSettings = z.infer<typeof petSettingsSchema>;

/** What the app shows. Times are ISO strings; health fields are null until the egg hatches. */
export const petViewSchema = z
  .object({
    enabled: z.boolean(),
    species: z.enum(petSpecies).nullable(),
    /** Set whenever `species` is, and kept after death for the memorial. */
    name: z.string().nullable(),
    /** Null while a living pet's owner has not picked a color yet (and with no pet). */
    color: z.enum(petColors).nullable(),
    stage: z.enum(petStages),
    points: z.number().int().nonnegative(),
    /** Points at which the next stage starts, or null for a Legend. */
    nextStagePoints: z.number().int().positive().nullable(),
    pointsToday: z.number().int().nonnegative(),
    eggStreakDays: z.number().int().nonnegative(),
    eggHatchDays: z.number().int().positive(),
    health: z.number().int().min(0).max(100).nullable(),
    healthState: z.enum(petHealthStates).nullable(),
    lastActivityAt: z.string().datetime().nullable(),
    diedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PetView = z.infer<typeof petViewSchema>;

/** What a device last showed in the pet pop-up (see petMoment.ts), read back from local storage. */
export const petSeenSchema = z
  .object({
    species: z.enum(petSpecies).nullable(),
    stage: z.enum(petStages),
    unwell: z.boolean(),
    /** An egg waiting to be tapped open. */
    ready: z.boolean(),
    diedAt: z.string().datetime().nullable(),
    date: isoDateSchema,
  })
  .strict();
export type PetSeen = z.infer<typeof petSeenSchema>;
