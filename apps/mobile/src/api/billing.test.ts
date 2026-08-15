import {
  cancelBillingSubscription,
  getBillingSummary,
  reconcileBillingCheckout,
  startBillingCheckout,
} from "./billing";

const token = "access-token";
const apiBase = "https://api.example.test";
jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function summaryPayload() {
  return {
    plan: "zoption_pro",
    entitlementSource: "paypal",
    provider: "paypal",
    status: "active",
    interval: "month",
    currentPeriodEndsAt: "2026-06-01T00:00:00.000Z",
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: null,
    canCheckout: false,
    canManageBilling: true,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 1,
    usages: [
      { feature: "assistant_question", used: 12, limit: 100, periodKind: "anchored_14_day", periodStartedAt: "2026-05-18T00:00:00.000Z", resetsAt: "2026-06-01T00:00:00.000Z" },
    ],
    allowances: [{ resource: "custom_category", used: 3, limit: null }],
  };
}

describe("billing api transport", () => {
  it("decodes the billing summary", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(summaryPayload()));
    const summary = await getBillingSummary({ accessToken: token, fetchImpl: fetchMock });
    expect(summary.plan).toBe("zoption_pro");
    expect(summary.usages[0]?.limit).toBe(100);
    expect(summary.allowances[0]?.resource).toBe("custom_category");
  });

  it("starts a checkout and decodes the approval URL", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ approvalUrl: "https://paypal.example/approve" }, 201));
    const result = await startBillingCheckout(
      { accessToken: token, fetchImpl: fetchMock },
      "year",
    );
    expect(result.approvalUrl).toBe("https://paypal.example/approve");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiBase + "/api/app/billing/checkout");
    expect(JSON.parse(init.body as string)).toEqual({ interval: "year" });
  });

  it("requests cancellation and decodes the confirmation", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ cancellationRequested: true }));
    const result = await cancelBillingSubscription({ accessToken: token, fetchImpl: fetchMock });
    expect(result.cancellationRequested).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiBase + "/api/app/billing/cancel");
    expect(init.method).toBe("POST");
  });

  it("reconciles a pending checkout outcome", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ outcome: "confirmed", summary: summaryPayload() }),
    );
    const result = await reconcileBillingCheckout({ accessToken: token, fetchImpl: fetchMock });
    expect(result.outcome).toBe("confirmed");
    expect(result.summary.plan).toBe("zoption_pro");
  });

  it("surfaces a non-cancelable conflict with the server message", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "subscription_not_cancelable", message: "There is no active subscription to cancel." }, 409),
    );
    await expect(
      cancelBillingSubscription({ accessToken: token, fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ code: "conflict", message: "There is no active subscription to cancel." });
  });

  it("rejects a malformed summary", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ plan: "ultra" }));
    await expect(
      getBillingSummary({ accessToken: token, fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ name: "ApiTransportError" });
  });
});
