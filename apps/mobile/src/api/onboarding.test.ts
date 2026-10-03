jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { getOnboardingState, saveOnboardingCash, saveOnboardingCurrency } from "./onboarding";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("onboarding api", () => {
  it("reads the step and validates it", async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(jsonResponse({ step: "currency", currency: "PHP" })),
    );
    await expect(getOnboardingState({ accessToken: "token", fetchImpl })).resolves.toEqual({
      step: "currency",
      currency: "PHP",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.zoption.test/api/app/onboarding",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("POSTs the currency and the cash step", async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(jsonResponse({ step: "cash", currency: "USD" })),
    );
    await saveOnboardingCurrency({ accessToken: "token", fetchImpl }, { currency: "USD" });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.zoption.test/api/app/onboarding/currency",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ currency: "USD" }) }),
    );

    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ step: "complete", currency: "USD", openingBalanceBooked: true }),
    );
    await expect(
      saveOnboardingCash(
        { accessToken: "token", fetchImpl },
        { amountMinor: 1500, date: "2026-10-03" },
      ),
    ).resolves.toMatchObject({ step: "complete", openingBalanceBooked: true });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.zoption.test/api/app/onboarding/cash-balance",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
