import { describe, expect, it, vi } from "vitest";

const reconcilePayPalCheckout = vi.hoisted(() => vi.fn());
const retryNotification = vi.hoisted(() => vi.fn());
const reconcileUser = vi.hoisted(() => vi.fn());
const billingRepository = vi.hoisted(() => ({}));

vi.mock("../src/billing/reconciliation", () => ({ reconcilePayPalCheckout }));
vi.mock("../src/db/billing", () => ({ billingRepository }));
vi.mock("../src/support/bug-reports", () => ({
  bugReportService: { retryNotification },
}));
vi.mock("../src/account-deletion", () => ({
  createAccountDeletionService: () => ({ reconcileUser }),
}));

import { handleQueuedJob } from "../src/job-handler";
import type { Bindings } from "../src/types";

const env = {} as Bindings;

describe("handleQueuedJob", () => {
  it("dispatches PayPal, bug-report, and account-deletion messages", async () => {
    reconcilePayPalCheckout.mockResolvedValue({ outcome: "pending" });
    retryNotification.mockResolvedValue(true);
    reconcileUser.mockResolvedValue("deleted");

    await handleQueuedJob(env, { type: "paypal-reconcile", tenantId: "user:1" });
    await handleQueuedJob(env, { type: "bug-report-notify", reportId: "report-1" });
    await handleQueuedJob(env, { type: "account-deletion", userId: "user-1" });

    expect(reconcilePayPalCheckout).toHaveBeenCalledWith(billingRepository, env, "user:1");
    expect(retryNotification).toHaveBeenCalledWith(env, "report-1");
    expect(reconcileUser).toHaveBeenCalledWith(env, "user-1");
  });
});
