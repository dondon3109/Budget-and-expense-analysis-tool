import {
  pushCategories,
  type PushCategory,
  type PushPlatform,
  type PushPreferences,
} from "@zoption/shared";

import type { Bindings } from "../types";

/** A person rarely has more phones than this; the oldest registration beyond it is dropped. */
const MAX_DEVICES_PER_USER = 10;

/**
 * Push devices and per-category opt-outs. Every method is keyed by the person (the Supabase user
 * id from the auth context), never a workspace, because one person can be in several workspaces.
 */
export interface PushRepository {
  registerDevice(
    env: Bindings,
    userId: string,
    token: string,
    platform: PushPlatform,
  ): Promise<void>;
  unregisterDevice(env: Bindings, userId: string, token: string): Promise<void>;
  preferences(env: Bindings, userId: string): Promise<PushPreferences>;
  setPreference(
    env: Bindings,
    userId: string,
    category: PushCategory,
    enabled: boolean,
  ): Promise<PushPreferences>;
  /** Tokens of the given people who have not turned `category` off. */
  deliveryTokens(env: Bindings, userIds: string[], category: PushCategory): Promise<string[]>;
  removeTokens(env: Bindings, tokens: string[]): Promise<void>;
}

export function createPushRepository(): PushRepository {
  async function preferences(env: Bindings, userId: string): Promise<PushPreferences> {
    const { results } = await env.DB.prepare(
      "SELECT category FROM push_preferences WHERE user_id = ?",
    )
      .bind(userId)
      .all<{ category: string }>();
    const off = new Set(results.map((row) => row.category));
    const categories = Object.fromEntries(
      pushCategories.map((category) => [category, !off.has(category)]),
    ) as PushPreferences["categories"];
    return { categories };
  }

  return {
    async registerDevice(env, userId, token, platform) {
      // A token is one install; when another account signs in on that phone the row moves to it.
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO push_devices (token, user_id, platform) VALUES (?, ?, ?)
           ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id,
             platform = excluded.platform, last_seen_at = datetime('now')`,
        ).bind(token, userId, platform),
        env.DB.prepare(
          `DELETE FROM push_devices WHERE user_id = ? AND token NOT IN (
             SELECT token FROM push_devices WHERE user_id = ?
             ORDER BY last_seen_at DESC, token LIMIT ?)`,
        ).bind(userId, userId, MAX_DEVICES_PER_USER),
      ]);
    },

    async unregisterDevice(env, userId, token) {
      await env.DB.prepare("DELETE FROM push_devices WHERE token = ? AND user_id = ?")
        .bind(token, userId)
        .run();
    },

    preferences,

    async setPreference(env, userId, category, enabled) {
      const statement = enabled
        ? env.DB.prepare("DELETE FROM push_preferences WHERE user_id = ? AND category = ?")
        : env.DB.prepare(
            `INSERT INTO push_preferences (user_id, category) VALUES (?, ?)
             ON CONFLICT(user_id, category) DO UPDATE SET updated_at = datetime('now')`,
          );
      await statement.bind(userId, category).run();
      return preferences(env, userId);
    },

    async deliveryTokens(env, userIds, category) {
      if (userIds.length === 0) return [];
      const placeholders = userIds.map(() => "?").join(", ");
      const { results } = await env.DB.prepare(
        `SELECT d.token FROM push_devices d
         WHERE d.user_id IN (${placeholders})
           AND NOT EXISTS (
             SELECT 1 FROM push_preferences p WHERE p.user_id = d.user_id AND p.category = ?)`,
      )
        .bind(...userIds, category)
        .all<{ token: string }>();
      return results.map((row) => row.token);
    },

    async removeTokens(env, tokens) {
      if (tokens.length === 0) return;
      await env.DB.batch(
        tokens.map((token) =>
          env.DB.prepare("DELETE FROM push_devices WHERE token = ?").bind(token),
        ),
      );
    },
  };
}

export const pushRepository = createPushRepository();
