import { personalBillingPlans } from "@zoption/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { isPlayDistribution } from "@/config/app-variant";

import { loadPlayOffers } from "./google-play";
import { PlanPicker } from "./PlanPicker";

jest.mock("@/config/app-variant", () => ({
  ...jest.requireActual("@/config/app-variant"),
  isPlayDistribution: jest.fn(() => false),
}));
jest.mock("./google-play", () => ({
  ...jest.requireActual("./google-play"),
  loadPlayOffers: jest.fn(),
}));

function renderPicker(onCheckout = jest.fn()) {
  return render(
    <PlanPicker
      plans={personalBillingPlans}
      suggestedPlan="budget"
      current={null}
      busy={null}
      onCheckout={onCheckout}
      onChange={jest.fn()}
    />,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("PlanPicker", () => {
  it("offers Dodo and PayPal web checkout outside the Play build", async () => {
    await renderPicker();

    expect(screen.getByText("Continue with Zoption Budget")).toBeTruthy();
    expect(screen.getByText("Continue with PayPal")).toBeTruthy();
    expect(screen.queryByText("Subscribe with Google Play")).toBeNull();
    expect(loadPlayOffers).not.toHaveBeenCalled();
  });

  it("sells only through Google Play, at Play's price, in the Play build", async () => {
    jest.mocked(isPlayDistribution).mockReturnValue(true);
    jest
      .mocked(loadPlayOffers)
      .mockResolvedValue(new Map([["budget:month", { price: "₱150.00", offerToken: "t" }]]));
    const onCheckout = jest.fn();
    await renderPicker(onCheckout);

    expect(await screen.findByText("₱150.00 / month")).toBeTruthy();
    expect(screen.queryByText("Continue with PayPal")).toBeNull();
    expect(screen.queryByText(/Dodo Payments/)).toBeNull();

    await fireEvent.press(screen.getByText("Subscribe with Google Play"));
    expect(onCheckout).toHaveBeenCalledWith({ plan: "budget", interval: "month" }, "google_play");
  });

  it("explains when Play cannot list the plans", async () => {
    jest.mocked(isPlayDistribution).mockReturnValue(true);
    jest.mocked(loadPlayOffers).mockRejectedValue(new Error("offline"));
    await renderPicker();

    expect(await screen.findByText(/Google Play could not list this plan/)).toBeTruthy();
  });
});
