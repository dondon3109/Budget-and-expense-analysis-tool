import * as Notifications from "expo-notifications";

import {
  clearPetNotifications,
  isPetNotification,
  outsideQuietHours,
  petNotificationPlan,
  schedulePetNotifications,
} from "./pet-notifications";
import { babyPet, noPet } from "./pet-test-fixtures";

const HOUR = 60 * 60 * 1000;
const iso = (at: number) => new Date(at).toISOString();
// 09:00 in Manila, so the pet's alerts start at 05:00 the next morning.
const lastActivity = Date.parse("2026-10-03T01:00:00Z");

describe("pet notifications", () => {
  beforeEach(() => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
    } as Notifications.NotificationPermissionsStatus);
    jest.mocked(Notifications.scheduleNotificationAsync).mockClear();
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockClear();
  });

  it("moves an alert due during quiet hours to 07:30 Manila", () => {
    expect(iso(outsideQuietHours(Date.parse("2026-10-03T15:00:00Z")))).toBe(
      "2026-10-03T23:30:00.000Z",
    );
    expect(iso(outsideQuietHours(Date.parse("2026-10-03T20:00:00Z")))).toBe(
      "2026-10-03T23:30:00.000Z",
    );
    const daytime = Date.parse("2026-10-03T05:00:00Z");
    expect(outsideQuietHours(daytime)).toBe(daytime);
  });

  it("warns a hatched pet ahead of each health step and its death", () => {
    const plan = petNotificationPlan(babyPet, lastActivity + HOUR);
    expect(plan.map((alert) => [alert.id, iso(alert.at)])).toEqual([
      // 20 hours lands at 05:00 Manila, so it waits until 07:30.
      ["zoption-pet-sleepy", "2026-10-03T23:30:00.000Z"],
      ["zoption-pet-sick", "2026-10-04T01:00:00.000Z"],
      ["zoption-pet-weaker", "2026-10-04T13:00:00.000Z"],
      ["zoption-pet-fading", "2026-10-05T01:00:00.000Z"],
      ["zoption-pet-12h", "2026-10-05T13:00:00.000Z"],
      ["zoption-pet-final", "2026-10-05T23:00:00.000Z"],
      ["zoption-pet-died", "2026-10-06T01:00:00.000Z"],
    ]);
    expect(plan[1]).toMatchObject({ title: "Your panda is sick" });
  });

  it("drops a warning that quiet hours would push past the pet's death", () => {
    // Fed at 07:30 Manila: the final warning falls at 05:30 and would wait until 07:30, the
    // moment it dies, so only the death notice goes out.
    const earlyActivity = Date.parse("2026-10-02T23:30:00Z");
    const pet = { ...babyPet, lastActivityAt: iso(earlyActivity) };
    const ids = petNotificationPlan(pet, earlyActivity + HOUR).map((alert) => alert.id);
    expect(ids).not.toContain("zoption-pet-final");
    expect(ids.at(-1)).toBe("zoption-pet-died");
  });

  it("schedules only the alerts still ahead of a sick pet", () => {
    const plan = petNotificationPlan(babyPet, lastActivity + 30 * HOUR);
    expect(plan.map((alert) => alert.id)).toEqual([
      "zoption-pet-weaker",
      "zoption-pet-fading",
      "zoption-pet-12h",
      "zoption-pet-final",
      "zoption-pet-died",
    ]);
  });

  it("reminds an egg at 20:00 tomorrow and notes a broken streak the morning after", () => {
    const egg = { ...babyPet, stage: "egg" as const, eggStreakDays: 3, lastActivityAt: null };
    const plan = petNotificationPlan(egg, lastActivity);
    expect(plan.map((alert) => [alert.id, iso(alert.at)])).toEqual([
      ["zoption-pet-egg", "2026-10-04T12:00:00.000Z"],
      ["zoption-pet-egg-reset", "2026-10-04T23:30:00.000Z"],
    ]);
    expect(plan[0]?.body).toBe("Open Zoption today to keep its 3-day streak.");
  });

  it("plans nothing for a pet that is off, unchosen, or a fresh egg", () => {
    expect(petNotificationPlan({ ...babyPet, enabled: false }, lastActivity)).toEqual([]);
    expect(petNotificationPlan(noPet, lastActivity)).toEqual([]);
    const freshEgg = { ...babyPet, stage: "egg" as const, eggStreakDays: 0 };
    expect(petNotificationPlan(freshEgg, lastActivity)).toEqual([]);
  });

  it("replaces every pet alert with the new plan on its own channel", async () => {
    await schedulePetNotifications(petNotificationPlan(babyPet, lastActivity + 30 * HOUR));
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("zoption-pet-sick");
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(5);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "zoption-pet-died",
        trigger: expect.objectContaining({ type: "date", channelId: "pet-alerts" }),
      }),
    );
  });

  it("never asks for permission and schedules nothing without it", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
    } as Notifications.NotificationPermissionsStatus);
    await schedulePetNotifications(petNotificationPlan(babyPet, lastActivity));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not schedule a plan that started before an identity change", async () => {
    const pending = schedulePetNotifications(petNotificationPlan(babyPet, lastActivity));
    await clearPetNotifications();
    await pending;
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(isPetNotification("zoption-pet-egg")).toBe(true);
    expect(isPetNotification("zoption-daily-reminder-noon")).toBe(false);
  });
});
