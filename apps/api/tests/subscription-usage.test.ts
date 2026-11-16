import { afterEach, describe, expect, it, vi } from "vitest";

import { subscriptionUsageRepository } from "../src/db/subscription-usage";
import { pushRepository } from "../src/db/push";
import { sendIdleSubscriptionNudges } from "../src/subscriptions/usage-nudges";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: Array<{ close(): void }> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const TODAY = "2026-11-16";

function seeded(): {
  env: Bindings;
  database: ReturnType<typeof createD1TestDatabase>["database"];
} {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  database.exec(`
    INSERT INTO tenants (id, kind, name) VALUES ('user:pro', 'user', 'Pro'), ('user:free', 'user', 'Free');
    INSERT INTO categories (id, tenant_id, name, kind, color, required_plan) VALUES
      ('cat-pro', 'user:pro', 'Fun', 'expense', '#123456', 'free'),
      ('cat-free', 'user:free', 'Fun', 'expense', '#123456', 'free');
    INSERT INTO subscriptions (id, tenant_id, category_id, name, amount_minor, billing_cycle, next_billing_date)
    VALUES
      ('sub-gym', 'user:pro', 'cat-pro', 'Gym', 150000, 'monthly', '2026-11-19'),
      ('sub-music', 'user:pro', 'cat-pro', 'Music', 19900, 'monthly', '2026-11-19'),
      ('sub-free', 'user:free', 'cat-free', 'Video', 54900, 'monthly', '2026-11-19');
    INSERT INTO pro_trials (tenant_id, started_at, ends_at)
    VALUES ('user:pro', datetime('now', '-1 day'), datetime('now', '+7 days'));
  `);
  return { env: { DB: binding } as Bindings, database };
}

describe("subscription usage check-ins", () => {
  it("records one check-in per day, lists it, and undoes it", async () => {
    const { env } = seeded();
    await subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", "2026-11-10", TODAY);
    await subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", TODAY, TODAY);
    // A second tap the same day changes nothing.
    await expect(
      subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", TODAY, TODAY),
    ).resolves.toEqual({ subscriptionId: "sub-gym", usedOn: ["2026-11-10", TODAY] });

    await expect(subscriptionUsageRepository.list(env, "user:pro", TODAY)).resolves.toEqual({
      usage: [{ subscriptionId: "sub-gym", usedOn: ["2026-11-10", TODAY] }],
      tracking: [],
    });

    await expect(
      subscriptionUsageRepository.undo(env, "user:pro", "sub-gym", TODAY, TODAY),
    ).resolves.toEqual({ subscriptionId: "sub-gym", usedOn: ["2026-11-10"] });
  });

  it("needs Pro", async () => {
    const { env } = seeded();
    await expect(
      subscriptionUsageRepository.checkIn(env, "user:free", "sub-free", TODAY, TODAY),
    ).rejects.toMatchObject({ status: 403, code: "upgrade_required" });
    await expect(subscriptionUsageRepository.list(env, "user:free", TODAY)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("never touches another tenant's subscription", async () => {
    const { env } = seeded();
    await expect(
      subscriptionUsageRepository.checkIn(env, "user:pro", "sub-free", TODAY, TODAY),
    ).rejects.toMatchObject({ status: 404, code: "subscription_not_found" });
  });

  it("refuses dates far in the future or past the window", async () => {
    const { env } = seeded();
    await expect(
      subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", "2026-11-18", TODAY),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", "2025-11-15", TODAY),
    ).rejects.toMatchObject({ status: 400 });
    // A phone a timezone ahead of Manila may already be on tomorrow.
    await expect(
      subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", "2026-11-17", TODAY),
    ).resolves.toMatchObject({ usedOn: ["2026-11-17"] });
  });

  it("saves the Track usage switch and keeps check-ins when it is off", async () => {
    const { env } = seeded();
    await subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", TODAY, TODAY);
    await subscriptionUsageRepository.setTracking(env, "user:pro", "sub-gym", true);
    await expect(
      subscriptionUsageRepository.setTracking(env, "user:pro", "sub-gym", false),
    ).resolves.toEqual({ subscriptionId: "sub-gym", tracked: false });
    await expect(subscriptionUsageRepository.list(env, "user:pro", TODAY)).resolves.toEqual({
      usage: [{ subscriptionId: "sub-gym", usedOn: [TODAY] }],
      tracking: [{ subscriptionId: "sub-gym", tracked: false }],
    });
    await expect(
      subscriptionUsageRepository.setTracking(env, "user:pro", "sub-free", true),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      subscriptionUsageRepository.setTracking(env, "user:free", "sub-free", true),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("drops check-ins with their subscription", async () => {
    const { env, database } = seeded();
    await subscriptionUsageRepository.checkIn(env, "user:pro", "sub-gym", TODAY, TODAY);
    database.exec("DELETE FROM subscriptions WHERE id = 'sub-gym'");
    expect(database.prepare("SELECT COUNT(*) AS count FROM subscription_usage").get()).toEqual({
      count: 0,
    });
  });
});

describe("idle subscription nudges", () => {
  it("nudges a tracked subscription unused for 30 days, three days before renewal, once", async () => {
    const { env, database } = seeded();
    database.exec(`
      INSERT INTO subscription_usage (tenant_id, subscription_id, used_on) VALUES
        ('user:pro', 'sub-gym', '2026-10-01'),
        ('user:pro', 'sub-music', '2026-11-15'),
        ('user:free', 'sub-free', '2026-09-01');
    `);
    const send = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const now = new Date("2026-11-16T03:17:00Z");

    await expect(
      sendIdleSubscriptionNudges(env, now, subscriptionUsageRepository, pushRepository, send),
    ).resolves.toEqual({ nudged: 1, failed: 0 });
    // Only the Pro gym: music was used yesterday, and the Free tenant has no Pro.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[2]).toEqual({
      userIds: ["pro"],
      category: "subscription_idle",
      title: "Still using Gym?",
      body: "It renews in 3 days and you last used it 46 days ago. Cancel it or keep it?",
      data: { path: "/subscriptions", subscriptionId: "sub-gym" },
    });

    await expect(
      sendIdleSubscriptionNudges(env, now, subscriptionUsageRepository, pushRepository, send),
    ).resolves.toEqual({ nudged: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never nudges a subscription switched off", async () => {
    const { env, database } = seeded();
    database.exec(`
      INSERT INTO subscription_usage (tenant_id, subscription_id, used_on)
      VALUES ('user:pro', 'sub-gym', '2026-10-01');
      INSERT INTO subscription_usage_settings (tenant_id, subscription_id, tracked)
      VALUES ('user:pro', 'sub-gym', 0);
    `);
    const send = vi.fn();
    await expect(
      sendIdleSubscriptionNudges(
        env,
        new Date("2026-11-16T03:17:00Z"),
        subscriptionUsageRepository,
        pushRepository,
        send,
      ),
    ).resolves.toEqual({ nudged: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("never nudges a subscription that was never checked in", async () => {
    const { env } = seeded();
    const send = vi.fn();
    await sendIdleSubscriptionNudges(
      env,
      new Date("2026-11-16T03:17:00Z"),
      subscriptionUsageRepository,
      pushRepository,
      send,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
