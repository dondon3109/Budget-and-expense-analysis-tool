import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  useAccountModeling,
  useLocalReferenceData,
  useLocalWorkspace,
  useSubscriptions,
} from "@/db/local-workspace-state";
import type { LocalSubscriptionItem } from "@/db/repository";
import type { LocalWorkspace } from "@/db/workspace";
import { ReferenceEditorScreen } from "./ReferenceEditorScreen";

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
  Stack: {
    Screen: () => null,
  },
  useLocalSearchParams: jest.fn(),
}));

jest.mock("@/db/local-workspace-state", () => ({
  useAccountModeling: jest.fn(),
  useLocalReferenceData: jest.fn(),
  useLocalWorkspace: jest.fn(),
  useSubscriptions: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: () => ({ retry: jest.fn() }),
}));

const archiveAccount = jest.fn();

function subscription(
  id: string,
  name: string,
  accountId: string,
  status: LocalSubscriptionItem["status"],
): LocalSubscriptionItem {
  return {
    id,
    name,
    amountMinor: 54_900,
    currency: "PHP",
    billingCycle: "monthly",
    nextBillingDate: "2026-09-01",
    status,
    categoryId: null,
    accountId,
    syncState: "synced",
  };
}

const netflix = subscription("sub-netflix", "Netflix", "acc-bank", "active");
const spotify = subscription("sub-spotify", "Spotify", "acc-bank", "active");
const gym = subscription("sub-gym", "Gym Membership", "acc-bank", "canceled");
const icloud = subscription("sub-icloud", "iCloud", "acc-cash", "active");
const accountSubscriptions = [netflix, spotify, gym, icloud];

describe("ReferenceEditorScreen archive warning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLocalSearchParams).mockReturnValue({ entityType: "account", id: "acc-bank" });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: { archiveAccount },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useLocalReferenceData).mockReturnValue({
      data: {
        accounts: [
          {
            id: "acc-bank",
            name: "BDO Checking",
            type: "checking",
            currency: "PHP",
            system: false,
            serverRevision: 1,
            syncState: "synced",
          },
        ],
        categories: [],
      },
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useAccountModeling).mockReturnValue({
      modeling: null,
      loading: false,
      error: null,
      retry: jest.fn(),
    });
  });

  it("counts and names the active subscriptions paid from the account", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: accountSubscriptions,
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<ReferenceEditorScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Archive account" }));

    expect(
      screen.getByText(/2 active subscriptions are paid from this account: Netflix, Spotify./),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Zoption skips due subscription charges while this account stays archived and emails you once per cycle./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Gym Membership/)).toBeNull();
    expect(screen.queryByText(/iCloud/)).toBeNull();
  });

  it("archives the account after the warning is shown", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: accountSubscriptions,
      loading: false,
      error: null,
      retry: jest.fn(),
    });
    archiveAccount.mockResolvedValue(undefined);

    await render(<ReferenceEditorScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Archive account" }));
    await fireEvent.press(screen.getByRole("button", { name: "Archive" }));

    expect(archiveAccount).toHaveBeenCalledWith("acc-bank");
    expect(router.back).toHaveBeenCalled();
  });

  it("uses the singular copy and keeps the existing message when one subscription is paid", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: [netflix],
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<ReferenceEditorScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Archive account" }));

    expect(
      screen.getByText(/1 active subscription is paid from this account: Netflix./),
    ).toBeTruthy();
  });

  it("shows no extra warning when the account pays for no active subscriptions", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: [gym, icloud],
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<ReferenceEditorScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Archive account" }));

    expect(
      screen.getByText(
        "It will stop appearing in new transaction choices. Existing records keep their account reference.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/paid from this account/)).toBeNull();
  });
});
