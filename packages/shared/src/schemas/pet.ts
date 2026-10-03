// Pet companion: the stored replay state and the view every client renders.

import { z } from "zod";

import { petActivityActions, petHealthStates, petSpecies, petStages } from "../pet";
import { isoDateSchema } from "./common";

const epochMsSchema = z.number().int().nonnegative();

/** The stored `PetState` (see pet.ts), read back from D1 as JSON. */
export const petStoredStateSchema = z
  .object({
    species: z.enum(petSpecies).nullable(),
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

export const petEggChoiceSchema = z.object({ species: z.enum(petSpecies) }).strict();
export type PetEggChoice = z.infer<typeof petEggChoiceSchema>;

export const petSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export type PetSettings = z.infer<typeof petSettingsSchema>;

/** What the app shows. Times are ISO strings; health fields are null until the egg hatches. */
export const petViewSchema = z
  .object({
    enabled: z.boolean(),
    species: z.enum(petSpecies).nullable(),
    stage: z.enum(petStages),
    points: z.number().int().nonnegative(),
    /** Points at which the next stage starts, or null for a Monster. */
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
