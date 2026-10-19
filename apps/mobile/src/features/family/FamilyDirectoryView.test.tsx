import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { listFamilyInvitations, listWorkspaces } from "@/api/workspaces";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyDirectoryView } from "./FamilyDirectoryView";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

jest.mock("@/auth/session-state", () => {
  const session = {
    status: "signed-in",
    subject: "user-1",
    getAccessToken: jest.fn().mockResolvedValue("access-token"),
  };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/api/workspaces", () => ({
  acceptFamilyInvitation: jest.fn(),
  createFamily: jest.fn(),
  declineFamilyInvitation: jest.fn(),
  listFamilyInvitations: jest.fn(),
  listWorkspaces: jest.fn(),
}));

jest.mock("./active-workspace", () => ({ useActiveWorkspace: jest.fn() }));

const personal = { id: "user-1", kind: "user", name: "Personal", role: "owner" } as const;
const switchTo = jest.fn();
const refresh = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useActiveWorkspace).mockReturnValue({
    switchTo,
    refresh,
  } as unknown as ReturnType<typeof useActiveWorkspace>);
  jest.mocked(listFamilyInvitations).mockResolvedValue([]);
});

describe("FamilyDirectoryView", () => {
  it("opens a family from its row", async () => {
    jest.mocked(listWorkspaces).mockResolvedValue({
      workspaces: [personal, { id: "fam-1", kind: "family", name: "Dela Cruz", role: "owner" }],
      familiesAvailable: true,
    });

    await render(<FamilyDirectoryView />);
    await fireEvent.press(await screen.findByRole("button", { name: "Dela Cruz, Owner" }));

    expect(refresh).toHaveBeenCalled();
    expect(switchTo).toHaveBeenCalledWith("fam-1");
    expect(router.replace).toHaveBeenCalledWith("/(app)/(tabs)");
    // Owning a family already means there is nothing to start, and no empty invitations card.
    expect(screen.queryByText("Start your own family")).toBeNull();
    expect(screen.queryByText("Invitations")).toBeNull();
  });

  it("welcomes someone with no family and lists an invitation addressed to them", async () => {
    jest.mocked(listWorkspaces).mockResolvedValue({
      workspaces: [personal],
      familiesAvailable: true,
    });
    jest.mocked(listFamilyInvitations).mockResolvedValue([
      {
        id: "inv-1",
        familyId: "fam-2",
        familyName: "Santos",
        role: "viewer",
        invitedBy: "ana@example.com",
        expiresAt: "2026-10-30T00:00:00.000Z",
      },
    ]);

    await render(<FamilyDirectoryView />);

    expect(await screen.findByText("Budget together as a family")).toBeTruthy();
    expect(screen.getByText("ana@example.com invited you as viewer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    expect(screen.getByText("Start a family")).toBeTruthy();
  });
});
