// Server push: the devices that receive it and the categories each person has turned off.
// Devices and preferences belong to a person, not a workspace, because one person can be in
// several workspaces and a notification is for them.

import { z } from "zod";

/** Server push topics; each one can be turned off per person. Family features send them. */
export const pushCategories = [
  "remittance_received",
  "family_spending",
  "family_digest",
  "low_balance",
  "comment_reply",
] as const;
export type PushCategory = (typeof pushCategories)[number];

export const pushPlatforms = ["android", "ios"] as const;
export type PushPlatform = (typeof pushPlatforms)[number];

/** An Expo push token as `getExpoPushTokenAsync` returns it. */
export const expoPushTokenSchema = z
  .string()
  .max(200)
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/u);

export const pushDeviceRegisterSchema = z
  .object({ token: expoPushTokenSchema, platform: z.enum(pushPlatforms) })
  .strict();

export const pushDeviceUnregisterSchema = z.object({ token: expoPushTokenSchema }).strict();

/** Every category with whether it is on; a category nobody turned off is on. */
export const pushPreferencesSchema = z
  .object({ categories: z.record(z.enum(pushCategories), z.boolean()) })
  .strict();

export const pushPreferenceUpdateSchema = z
  .object({ category: z.enum(pushCategories), enabled: z.boolean() })
  .strict();

export type PushDeviceRegisterInput = z.infer<typeof pushDeviceRegisterSchema>;
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;
export type PushPreferenceUpdate = z.infer<typeof pushPreferenceUpdateSchema>;
