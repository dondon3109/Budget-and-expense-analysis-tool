import { act, renderHook } from "@testing-library/react-native";
import { finishTransaction } from "expo-iap";

import {
  ApiTransportError,
  changeBillingPlan,
  getGooglePlayAccountId,
  reportGooglePlayPurchase,
  startBillingCheckout,
} from "@/api/billing";

import { buyOnGooglePlay, loadPlayOffers } from "./google-play";
import { MANAGED_IN_GOOGLE_PLAY_MESSAGE, usePlanCheckout } from "./use-plan-checkout";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { FULL_SCREEN: "fullScreen" },
}));
jest.mock("@/features/thank-you/ThankYouHost", () => ({ showThankYou: jest.fn() }));
jest.mock("@/auth/session-state", () => {
  const session = { getAccessToken: jest.fn().mockResolvedValue("access-token") };
  return { useSessionSnapshot: () => session };
});
jest.mock("@/api/billing", () => ({
  ...jest.requireActual("@/api/billing"),
  changeBillingPlan: jest.fn(),
  getGooglePlayAccountId: jest.fn(),
  reportGooglePlayPurchase: jest.fn(),
  startBillingCheckout: jest.fn(),
}));
jest.mock("./google-play", () => ({
  ...jest.requireActual("./google-play"),
  buyOnGooglePlay: jest.fn(),
  loadPlayOffers: jest.fn(),
}));

const accountId = "a".repeat(64);
const playPurchase = {
  productId: "zoption_family_pro",
  purchaseToken: "token-1",
  purchaseState: "purchased",
  obfuscatedProfileIdAndroid: "fam-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(loadPlayOffers)
    .mockResolvedValue(new Map([["family_pro:year", { price: "₱3,990.00", offerToken: "t" }]]));
  jest.mocked(getGooglePlayAccountId).mockResolvedValue(accountId);
});

describe("usePlanCheckout with Google Play", () => {
  it("buys on Play, has the family endpoint verify it, and refreshes the plan", async () => {
    jest.mocked(buyOnGooglePlay).mockResolvedValue(playPurchase as never);
    jest
      .mocked(reportGooglePlayPurchase)
      .mockResolvedValue({ outcome: "applied", subscription: null });
    const onSettled = jest.fn();
    const { result } = await renderHook(() => usePlanCheckout("fam-1", onSettled));

    await act(() =>
      result.current.checkout({ plan: "family_pro", interval: "year" }, "google_play"),
    );

    expect(buyOnGooglePlay).toHaveBeenCalledWith({
      choice: { plan: "family_pro", interval: "year" },
      offerToken: "t",
      obfuscatedAccountId: accountId,
      familyId: "fam-1",
    });
    expect(reportGooglePlayPurchase).toHaveBeenCalledWith(
      { accessToken: "access-token", workspaceId: "fam-1" },
      "family_pro",
      { productId: "zoption_family_pro", basePlanId: "yearly", purchaseToken: "token-1" },
    );
    expect(startBillingCheckout).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith(null);
    expect(result.current.message).toBe("Your subscription is active. Thank you for upgrading.");
    expect(result.current.busy).toBeNull();
  });

  it("says a pending Play payment has not started the plan yet", async () => {
    jest.mocked(buyOnGooglePlay).mockResolvedValue(playPurchase as never);
    jest
      .mocked(reportGooglePlayPurchase)
      .mockResolvedValue({ outcome: "pending", subscription: null });
    const { result } = await renderHook(() => usePlanCheckout("fam-1", jest.fn()));

    await act(() =>
      result.current.checkout({ plan: "family_pro", interval: "year" }, "google_play"),
    );

    expect(result.current.message).toMatch(/still processing your payment/);
  });

  it("reports nothing when the buyer cancels", async () => {
    jest.mocked(buyOnGooglePlay).mockResolvedValue(null);
    const onSettled = jest.fn();
    const { result } = await renderHook(() => usePlanCheckout(null, onSettled));

    await act(() =>
      result.current.checkout({ plan: "family_pro", interval: "year" }, "google_play"),
    );

    expect(reportGooglePlayPurchase).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(result.current.message).toBe("Purchase canceled. You were not charged.");
  });

  it("says a paid purchase confirms later when Play billing is not configured", async () => {
    jest.mocked(buyOnGooglePlay).mockResolvedValue(playPurchase as never);
    jest
      .mocked(reportGooglePlayPurchase)
      .mockRejectedValue(
        new ApiTransportError("Not configured", "unavailable", 503, "billing_not_configured"),
      );
    const onSettled = jest.fn();
    const { result } = await renderHook(() => usePlanCheckout("fam-1", onSettled));

    await act(() =>
      result.current.checkout({ plan: "family_pro", interval: "year" }, "google_play"),
    );

    expect(finishTransaction).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(result.current.message).toMatch(/cannot confirm Google Play purchases yet/);
    expect(result.current.message).toMatch(/next time you open the app/);
  });

  it("names Google Play when the Worker refuses a change it does not bill", async () => {
    jest
      .mocked(changeBillingPlan)
      .mockRejectedValue(
        new ApiTransportError("Managed", "conflict", 409, "managed_in_google_play"),
      );
    const { result } = await renderHook(() => usePlanCheckout(null, jest.fn()));

    await act(() => result.current.change({ plan: "pro", interval: "month" }));

    expect(result.current.message).toBe(MANAGED_IN_GOOGLE_PLAY_MESSAGE);
  });
});
