import { act, render, screen } from "@testing-library/react-native";

import {
  useLocalReferenceData,
  useLocalWorkspace,
  useSubscription,
} from "@/db/local-workspace-state";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { SubscriptionEditorScreen } from "./SubscriptionEditorScreen";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
let mockId: string | undefined;
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock("@/db/local-workspace-state", () => ({
  useLocalReferenceData: jest.fn(),
  useLocalWorkspace: jest.fn(),
  useSubscription: jest.fn(),
}));
jest.mock("@/sync/sync-state", () => ({ useSyncState: () => ({ retry: jest.fn() }) }));

const stored = {
  id: "sub-1",
  name: "Figma",
  amountMinor: 1_200,
  currency: "USD" as const,
  billingCycle: "monthly" as const,
  nextBillingDate: "2026-09-01",
  status: "active" as const,
  categoryId: null,
  accountId: null,
  syncState: "synced" as const,
};

function mockState(subscription: typeof stored | null) {
  (useLocalWorkspace as jest.Mock).mockReturnValue({ workspace: null });
  (useLocalReferenceData as jest.Mock).mockReturnValue({ data: { categories: [], accounts: [] } });
  (useSubscription as jest.Mock).mockReturnValue({
    subscription,
    loading: false,
    error: null,
    retry: jest.fn(),
  });
}

describe("SubscriptionEditorScreen currency", () => {
  afterEach(async () => {
    mockId = undefined;
    await act(async () => useWorkspaceCurrencyStore.setState({ currency: "PHP" }));
  });

  it("starts a new subscription in the workspace currency", async () => {
    useWorkspaceCurrencyStore.setState({ currency: "USD" });
    mockState(null);
    await render(<SubscriptionEditorScreen />);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    expect(screen.queryByText("PHP")).toBeNull();
  });

  it("edits a subscription in its own stored currency", async () => {
    mockId = "sub-1";
    mockState(stored);
    await render(<SubscriptionEditorScreen />);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    expect(screen.queryByText("PHP")).toBeNull();
  });
});
