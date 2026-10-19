// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { FamilyBillingSummary, FamilyDetail } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "cancelFamilyPlan",
    "getFamilyBillingSummary",
    "reconcileBillingCheckout",
  ]),
);

import { FamilyPlanSection } from "../src/components/family/FamilyPlanSection";
import { getFamilyBillingSummary } from "../src/lib/api";
import { renderWithProviders } from "./helpers/render";

const family = { key: "family:family-1:user-1" as const, userId: "user-1", familyId: "family-1" };

function detail(overrides: Partial<FamilyDetail> = {}): FamilyDetail {
  return {
    id: "family-1",
    name: "Santos",
    role: "owner",
    members: [],
    invitations: [],
    seats: { limit: 6, used: 1, cooling: 0 },
    swaps: { limit: 4, used: 0 },
    closesAt: null,
    plan: "unpaid",
    ...overrides,
  };
}

const unpaid: FamilyBillingSummary = {
  state: "unpaid",
  plan: null,
  interval: null,
  provider: null,
  status: null,
  currentPeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  paidByYou: false,
  pendingChange: null,
  pendingCheckout: null,
  canCheckout: true,
  canChangePlan: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("FamilyPlanSection", () => {
  it("tells the owner of an unpaid family it is theirs alone until they choose a plan", async () => {
    vi.mocked(getFamilyBillingSummary).mockResolvedValue(unpaid);
    renderWithProviders(<FamilyPlanSection family={family} detail={detail()} />);

    expect(await screen.findByText(/invitations open once you choose a plan/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose a family plan" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Just you for now")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("zoption:family-just-you:family-1")).toBe("1");
  });

  it("shows the owner the paid plan with change and cancel actions", async () => {
    vi.mocked(getFamilyBillingSummary).mockResolvedValue({
      ...unpaid,
      state: "active",
      plan: "family_pro",
      interval: "month",
      provider: "dodo",
      status: "active",
      currentPeriodEndsAt: "2099-01-01T00:00:00.000Z",
      paidByYou: true,
      canCheckout: false,
      canChangePlan: true,
    });
    renderWithProviders(<FamilyPlanSection family={family} detail={detail({ plan: "active" })} />);

    expect(await screen.findByText(/Family Pro covers the family/)).toHaveTextContent(
      "everyone in it gets Zoption Pro",
    );
    expect(screen.getByRole("button", { name: "Change plan" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel renewal" })).toBeVisible();
    expect(screen.queryByText("Just you for now")).not.toBeInTheDocument();
  });

  it("tells a member the family is read only once its plan lapsed, without asking for billing", () => {
    renderWithProviders(
      <FamilyPlanSection family={family} detail={detail({ role: "member", plan: "lapsed" })} />,
    );

    expect(screen.getByText(/read only until the owner renews it/)).toBeVisible();
    expect(getFamilyBillingSummary).not.toHaveBeenCalled();
  });
});
