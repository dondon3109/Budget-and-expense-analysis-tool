import type { FamilyBillingSummary, FamilyDetail } from "@zoption/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { getFamilyBillingSummary } from "@/api/billing";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyPlanSection } from "./FamilyPlanSection";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { FULL_SCREEN: "fullScreen" },
}));
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
});

jest.mock("@/auth/session-state", () => {
  const session = {
    status: "signed-in",
    subject: "user-1",
    getAccessToken: jest.fn().mockResolvedValue("access-token"),
  };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/api/billing", () => ({
  ...jest.requireActual("@/api/billing"),
  cancelFamilyPlan: jest.fn(),
  changeBillingPlan: jest.fn(),
  getFamilyBillingSummary: jest.fn(),
  reconcileBillingCheckout: jest.fn(),
  startBillingCheckout: jest.fn(),
}));

jest.mock("./active-workspace", () => ({ useActiveWorkspace: jest.fn() }));

function detail(overrides: Partial<FamilyDetail> = {}): FamilyDetail {
  return {
    id: "fam-1",
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useActiveWorkspace).mockReturnValue({
    family: { id: "fam-1", name: "Santos", role: "owner" },
  } as unknown as ReturnType<typeof useActiveWorkspace>);
});

describe("FamilyPlanSection", () => {
  it("tells the owner of an unpaid family it is theirs alone and offers the family plans", async () => {
    jest.mocked(getFamilyBillingSummary).mockResolvedValue(unpaid);
    await render(<FamilyPlanSection detail={detail()} onChanged={jest.fn()} />);

    expect(await screen.findByText(/invitations open once you choose a plan/)).toBeTruthy();
    expect(await screen.findByText("Just you for now")).toBeTruthy();
    expect(getFamilyBillingSummary).toHaveBeenCalledWith({
      accessToken: "access-token",
      workspaceId: "fam-1",
    });

    await fireEvent.press(screen.getByRole("button", { name: "Choose a family plan" }));
    expect(screen.getByText("Continue with Family Budget")).toBeTruthy();
  });

  it("shows the owner the paid plan with a change and a cancel", async () => {
    jest.mocked(getFamilyBillingSummary).mockResolvedValue({
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
    await render(<FamilyPlanSection detail={detail({ plan: "active" })} onChanged={jest.fn()} />);

    expect(await screen.findByText(/everyone in it gets Zoption Pro/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel renewal" })).toBeTruthy();
    expect(screen.queryByText("Just you for now")).toBeNull();
  });

  it("tells a member the lapsed family is read only, without asking for billing", async () => {
    await render(
      <FamilyPlanSection
        detail={detail({ role: "member", plan: "lapsed" })}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText(/read only until the owner renews it/)).toBeTruthy();
    expect(getFamilyBillingSummary).not.toHaveBeenCalled();
  });
});
