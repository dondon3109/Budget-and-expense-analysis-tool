import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bindings } from "../src/types";

const reconcileDuePayPalCheckouts = vi.hoisted(() => vi.fn());
const cleanupExpired = vi.hoisted(() => vi.fn());
const reconcileAccountDeletions = vi.hoisted(() => vi.fn());
const creditDueInterest = vi.hoisted(() => vi.fn());
const billingRepository = vi.hoisted(() => ({}));

vi.mock("../src/app", () => ({ createApp: () => ({ fetch: vi.fn() }) }));
vi.mock("../src/billing/scheduled-reconciliation", () => ({ reconcileDuePayPalCheckouts }));
vi.mock("../src/db/assistant", () => ({ assistantRepository: { cleanupExpired } }));
vi.mock("../src/db/billing", () => ({ billingRepository }));
vi.mock("../src/interest/scheduled-credit", () => ({ creditDueInterest }));
vi.mock("../src/account-deletion", () => ({
  createAccountDeletionService: () => ({ reconcile: reconcileAccountDeletions }),
}));

import worker from "../src/index";

const environment = {} as Bindings;

function controller(cron: string): ScheduledController {
  return { cron, scheduledTime: 0, noRetry: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  reconcileDuePayPalCheckouts.mockResolvedValue({
    checked: 0,
    confirmed: 0,
    closed: 0,
    pending: 0,
    failed: 0,
  });
  cleanupExpired.mockResolvedValue(0);
  reconcileAccountDeletions.mockResolvedValue(0);
  creditDueInterest.mockResolvedValue({ checked: 0, credited: 0, skipped: 0 });
});

describe("scheduled worker handler", () => {
  it("runs only PayPal checkout recovery on the five-minute cadence", async () => {
    await worker.scheduled(controller("*/5 * * * *"), environment);

    expect(reconcileDuePayPalCheckouts).toHaveBeenCalledWith(billingRepository, environment, 25);
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });

  it("runs daily maintenance without PayPal checkout recovery", async () => {
    cleanupExpired.mockResolvedValueOnce(100).mockResolvedValueOnce(3);

    await worker.scheduled(controller("17 3 * * *"), environment);

    expect(cleanupExpired).toHaveBeenCalledTimes(2);
    expect(reconcileAccountDeletions).toHaveBeenCalledWith(environment, 25);
    expect(reconcileDuePayPalCheckouts).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });

  it("credits interest on the daily interest cron", async () => {
    await worker.scheduled(controller("17 4 * * *"), environment);

    expect(creditDueInterest).toHaveBeenCalledWith(environment);
    expect(reconcileDuePayPalCheckouts).not.toHaveBeenCalled();
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
  });

  it("ignores unrecognized cron deliveries", async () => {
    await worker.scheduled(controller("1 2 3 4 5"), environment);

    expect(reconcileDuePayPalCheckouts).not.toHaveBeenCalled();
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });
});
