import type { FamilyDetail } from "@zoption/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { getFamilyDetail, setFamilyMemberRole } from "@/api/family";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyManagerView } from "./FamilyManagerView";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

jest.mock("@/auth/session-state", () => {
  const session = {
    status: "signed-in",
    subject: "user-1",
    getAccessToken: jest.fn().mockResolvedValue("access-token"),
  };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/api/family", () => ({
  closeFamily: jest.fn(),
  getFamilyDetail: jest.fn(),
  inviteFamilyMember: jest.fn(),
  removeFamilyMember: jest.fn(),
  resendFamilyInvitation: jest.fn(),
  revokeFamilyInvitation: jest.fn(),
  setFamilyMemberRole: jest.fn(),
  transferFamily: jest.fn(),
}));

jest.mock("./active-workspace", () => ({ useActiveWorkspace: jest.fn() }));
// Alerts load their own settings; they are covered by family-alerts.test.ts.
jest.mock("./FamilyAlertsCard", () => ({ FamilyAlertsCard: () => null }));

const detail: FamilyDetail = {
  id: "fam-1",
  name: "Dela Cruz",
  role: "owner",
  members: [
    { userId: "user-1", email: "don@example.com", role: "owner", joinedAt: "2026-10-01T00:00:00Z" },
    {
      userId: "user-2",
      email: "ana@example.com",
      role: "member",
      joinedAt: "2026-10-02T00:00:00Z",
    },
  ],
  invitations: [],
  seats: { limit: 6, used: 2, cooling: 0 },
  swaps: { limit: 3, used: 0 },
  closesAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useActiveWorkspace).mockReturnValue({
    family: { id: "fam-1", name: "Dela Cruz", role: "owner" },
    refresh: jest.fn(),
  } as unknown as ReturnType<typeof useActiveWorkspace>);
  jest.mocked(getFamilyDetail).mockResolvedValue(detail);
  jest.mocked(setFamilyMemberRole).mockResolvedValue(undefined);
});

describe("FamilyManagerView", () => {
  it("names the owner as You and manages another member from a sheet", async () => {
    await render(<FamilyManagerView />);

    expect(await screen.findByText("You")).toBeTruthy();
    expect(screen.getByText("2 of 6 taken")).toBeTruthy();
    // The owner's own row has nothing to manage.
    expect(screen.queryByRole("button", { name: "You, Owner" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "ana@example.com, Member" }));
    // The invite form has its own chooser; the member sheet's renders after it.
    const viewerChoices = screen.getAllByRole("radio", {
      name: "Viewer: Sees everything, changes nothing",
    });
    await fireEvent.press(viewerChoices[viewerChoices.length - 1]!);

    expect(setFamilyMemberRole).toHaveBeenCalledWith(
      { accessToken: "access-token", workspaceId: "fam-1" },
      "user-2",
      "viewer",
    );
  });
});
