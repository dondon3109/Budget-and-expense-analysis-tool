import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Bindings } from "../src/types";

const reconcileDueBillingCheckouts = vi.hoisted(() => vi.fn());
const cleanupExpired = vi.hoisted(() => vi.fn());
const reconcileAccountDeletions = vi.hoisted(() => vi.fn());
const creditDueInterest = vi.hoisted(() => vi.fn());
const validateRequiredApiBindings = vi.hoisted(() => vi.fn());
const retryPendingBugReportNotifications = vi.hoisted(() => vi.fn());
const cleanupExpiredBugReports = vi.hoisted(() => vi.fn());
const billingRepository = vi.hoisted(() => ({}));
const dispatchBugfixDraft = vi.hoisted(() => vi.fn());
const sendDueTrialEmails = vi.hoisted(() => vi.fn());

vi.mock("../src/app", () => ({ createApp: () => ({ fetch: vi.fn() }) }));
vi.mock("../src/readiness", () => ({ validateRequiredApiBindings }));
vi.mock("../src/billing/scheduled-reconciliation", () => ({ reconcileDueBillingCheckouts }));
vi.mock("../src/billing/trial-emails", () => ({
  trialEmailService: { sendDue: sendDueTrialEmails },
}));
vi.mock("../src/db/assistant", () => ({ assistantRepository: { cleanupExpired } }));
vi.mock("../src/db/billing", () => ({
  billingRepository,
  hasProEntitlement: vi.fn(async () => false),
}));
vi.mock("../src/interest/scheduled-credit", () => ({ creditDueInterest }));
vi.mock("../src/account-deletion", () => ({
  createAccountDeletionService: () => ({
    reconcile: reconcileAccountDeletions,
    reconcileUser: vi.fn(),
  }),
}));
vi.mock("../src/support/bug-reports", () => ({
  bugReportService: {
    retryPendingNotifications: retryPendingBugReportNotifications,
    retryNotification: vi.fn(),
    cleanupExpired: cleanupExpiredBugReports,
  },
}));

vi.mock("../src/support/bugfix-dispatch", () => ({ dispatchBugfixDraft }));

import worker from "../src/index";

const environment = {
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        raw: async () => [],
        run: async () => ({ meta: { changes: 0 } }),
      }),
    }),
    batch: async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 0 } })),
  },
} as unknown as Bindings;

function controller(cron: string, scheduledTime = 0): ScheduledController {
  return { cron, scheduledTime, noRetry: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  reconcileDueBillingCheckouts.mockResolvedValue({
    checked: 0,
    confirmed: 0,
    closed: 0,
    pending: 0,
    failed: 0,
  });
  cleanupExpired.mockResolvedValue(0);
  reconcileAccountDeletions.mockResolvedValue(0);
  creditDueInterest.mockResolvedValue({ checked: 0, credited: 0, skipped: 0 });
  retryPendingBugReportNotifications.mockResolvedValue({ claimed: 0, sent: 0, failed: 0 });
  cleanupExpiredBugReports.mockResolvedValue(0);
  dispatchBugfixDraft.mockResolvedValue("idle");
  sendDueTrialEmails.mockResolvedValue({ checked: 0, sent: 0, skipped: 0, failed: 0 });
});

describe("scheduled worker handler", () => {
  it("runs only PayPal checkout recovery on the five-minute cadence", async () => {
    await worker.scheduled(controller("*/5 * * * *"), environment);

    expect(validateRequiredApiBindings).toHaveBeenCalledWith(environment);
    expect(reconcileDueBillingCheckouts).toHaveBeenCalledWith(billingRepository, environment, 25);
    expect(retryPendingBugReportNotifications).toHaveBeenCalledWith(environment, 25);
    expect(sendDueTrialEmails).toHaveBeenCalledWith(environment, 50);
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });

  it("checks for a waiting bug report on every third five-minute tick only", async () => {
    await worker.scheduled(controller("*/5 * * * *", Date.UTC(2026, 8, 23, 14, 5)), environment);
    await worker.scheduled(controller("*/5 * * * *", Date.UTC(2026, 8, 23, 14, 10)), environment);
    expect(dispatchBugfixDraft).not.toHaveBeenCalled();

    await worker.scheduled(controller("*/5 * * * *", Date.UTC(2026, 8, 23, 14, 15)), environment);
    expect(dispatchBugfixDraft).toHaveBeenCalledExactlyOnceWith(environment);
  });

  it("runs daily maintenance without PayPal checkout recovery", async () => {
    cleanupExpired.mockResolvedValueOnce(100).mockResolvedValueOnce(3);

    await worker.scheduled(controller("17 3 * * *"), environment);

    expect(cleanupExpired).toHaveBeenCalledTimes(2);
    expect(reconcileAccountDeletions).toHaveBeenCalledWith(environment, 25);
    expect(cleanupExpiredBugReports).toHaveBeenCalledWith(environment, 100);
    expect(reconcileDueBillingCheckouts).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });

  it("credits interest on the daily interest cron", async () => {
    await worker.scheduled(controller("17 4 * * *"), environment);

    expect(creditDueInterest).toHaveBeenCalledWith(environment);
    expect(reconcileDueBillingCheckouts).not.toHaveBeenCalled();
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
  });

  it("fails closed before scheduled work when required bindings are unavailable", async () => {
    validateRequiredApiBindings.mockImplementationOnce(() => {
      throw new Error("API deployment bindings are not ready.");
    });

    await expect(worker.scheduled(controller("*/5 * * * *"), environment)).rejects.toThrow(
      "API deployment bindings are not ready.",
    );
    expect(reconcileDueBillingCheckouts).not.toHaveBeenCalled();
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });

  it("validates bindings before ignoring unrecognized cron deliveries", async () => {
    await worker.scheduled(controller("1 2 3 4 5"), environment);

    expect(validateRequiredApiBindings).toHaveBeenCalledWith(environment);
    expect(reconcileDueBillingCheckouts).not.toHaveBeenCalled();
    expect(cleanupExpired).not.toHaveBeenCalled();
    expect(reconcileAccountDeletions).not.toHaveBeenCalled();
    expect(creditDueInterest).not.toHaveBeenCalled();
  });
});
