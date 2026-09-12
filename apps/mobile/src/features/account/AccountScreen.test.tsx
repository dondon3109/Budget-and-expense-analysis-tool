import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

import { AccountScreen } from "./AccountScreen";
import { downloadAccountArchive } from "@/api/account";

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
}));

jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((path: string, name?: string) => ({
    uri: `file://${path}/${name ?? ""}`,
    write: jest.fn(),
  })),
  Paths: {
    cache: "/mock-cache",
  },
}));

jest.mock("@/api/account", () => ({
  ...jest.requireActual("@/api/account"),
  downloadAccountArchive: jest.fn(),
  requestAccountDeletion: jest.fn(),
}));

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-in",
    subject: { id: "user-1", email: "user@example.com" },
    getAccessToken: jest.fn(async () => "mock-access-token"),
    signOut: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: () => ({
    workspace: { schemaVersion: 1 },
  }),
  useLocalWorkspaceStats: () => ({
    stats: {
      transactionCount: 5,
      accountCount: 2,
      categoryCount: 8,
    },
  }),
}));

describe("AccountScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  });

  it("renders data portability card and exports full account archive", async () => {
    jest.mocked(downloadAccountArchive).mockResolvedValueOnce({
      version: "1.0",
      exportedAt: "2026-09-12T00:00:00Z",
      accounts: [],
      transactions: [],
    });

    await render(<AccountScreen />);

    expect(screen.getByText("Data portability & backup")).toBeTruthy();
    const exportButton = screen.getByRole("button", {
      name: "Export & Share account archive (.json)",
    });
    expect(exportButton).toBeTruthy();

    await fireEvent.press(exportButton);

    await waitFor(() => {
      expect(downloadAccountArchive).toHaveBeenCalledWith({
        accessToken: "mock-access-token",
      });
      expect(Share.share).toHaveBeenCalled();
      expect(screen.getByText("Account archive exported successfully.")).toBeTruthy();
    });
  });
});
