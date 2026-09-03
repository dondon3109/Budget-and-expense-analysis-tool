import { fireEvent, render, screen } from "@testing-library/react-native";
import { Clipboard } from "react-native";

import { decodeSharedBudgetToken } from "@zoption/shared";
import { useBudgetMonth, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { useSyncState } from "@/sync/sync-state";
import { BudgetsScreen } from "./BudgetsScreen";
import { SHARED_BUDGET_BASE_URL, ShareBudgetSheet } from "./ShareBudgetSheet";
import type { BudgetMonthRow } from "./budget-month-view";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isInternetReachable: true, isConnected: true })),
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: jest.fn(),
  useBudgetMonth: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

const ROWS: BudgetMonthRow[] = [
  {
    id: "budget-1",
    categoryId: "cat-1",
    categoryName: "Dining",
    categoryColor: "#FF5722",
    categoryIconEmoji: "🍔",
    limitMinor: 50_000,
    spentMinor: 20_000,
    remainingMinor: 30_000,
    usedPercent: 40,
    overBudget: false,
    syncState: "synced",
  },
  {
    id: "budget-2",
    categoryId: "cat-2",
    categoryName: "Groceries",
    categoryColor: "#0F766E",
    categoryIconEmoji: "🛒",
    limitMinor: 80_000,
    spentMinor: 10_000,
    remainingMinor: 70_000,
    usedPercent: 12.5,
    overBudget: false,
    syncState: "synced",
  },
];

function renderSheet(rows: BudgetMonthRow[] = ROWS, copyLink?: (url: string) => void) {
  return render(
    <ShareBudgetSheet
      copyLink={copyLink}
      month="2026-09-01"
      monthLabel="September 2026"
      onDismiss={jest.fn()}
      rows={rows}
      visible
    />,
  );
}

function generatedUrl(): string {
  return screen.getByLabelText("Generated share link").props.children as string;
}

function tokenFromUrl(url: string): string {
  expect(url.startsWith(`${SHARED_BUDGET_BASE_URL}/`)).toBe(true);
  return url.slice(SHARED_BUDGET_BASE_URL.length + 1);
}

describe("ShareBudgetSheet", () => {
  it("lists every envelope selected by default with expiry options", async () => {
    await renderSheet();

    const dining = screen.getByRole("checkbox", { name: "Share Dining" });
    const groceries = screen.getByRole("checkbox", { name: "Share Groceries" });
    expect(dining.props.accessibilityState).toMatchObject({ checked: true });
    expect(groceries.props.accessibilityState).toMatchObject({ checked: true });

    expect(screen.getByRole("button", { name: "7 days" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "30 days" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No expiry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate share link" })).toBeEnabled();
  });

  it("generates a tamper-evident view-only token covering only selected envelopes", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByRole("checkbox", { name: "Share Groceries" }));
    await fireEvent.press(screen.getByRole("button", { name: "Generate share link" }));

    const decoded = decodeSharedBudgetToken(tokenFromUrl(generatedUrl()));
    expect(decoded.valid).toBe(true);
    expect(decoded.payload?.title).toBe("Family Budget - September 2026");
    expect(decoded.payload?.month).toBe("2026-09-01");
    expect(decoded.payload?.envelopes.map((item) => item.categoryName)).toEqual(["Dining"]);
    expect(decoded.payload?.totalAllocatedMinor).toBe(50_000);

    const tampered = `${tokenFromUrl(generatedUrl()).slice(0, -1)}0`;
    expect(decodeSharedBudgetToken(tampered)).toMatchObject({ valid: false });
  });

  it("honours the 30-day and permanent expiry options", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByRole("button", { name: "30 days" }));
    await fireEvent.press(screen.getByRole("button", { name: "Generate share link" }));
    const thirtyDayPayload = decodeSharedBudgetToken(tokenFromUrl(generatedUrl())).payload;
    const expiresAt = Date.parse(thirtyDayPayload?.expiresAt ?? "");
    expect(expiresAt).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(expiresAt).toBeLessThan(Date.now() + 31 * 86_400_000);

    await fireEvent.press(screen.getByRole("button", { name: "No expiry" }));
    expect(screen.queryByLabelText("Generated share link")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Generate share link" }));
    const permanentPayload = decodeSharedBudgetToken(tokenFromUrl(generatedUrl())).payload;
    expect(permanentPayload?.expiresAt).toBeUndefined();
  });

  it("requires at least one envelope before generating", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByRole("checkbox", { name: "Share Dining" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Share Groceries" }));
    await fireEvent.press(screen.getByRole("button", { name: "Generate share link" }));

    expect(screen.getByRole("alert")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Generated share link")).toBeNull();
  });

  it("disables generation when there are no envelopes", async () => {
    await renderSheet([]);

    expect(screen.getByText("No envelopes to share yet. Add a category budget first."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Generate share link" })).toBeDisabled();
  });

  it("copies the generated link to the clipboard with one tap", async () => {
    const setString = jest.spyOn(Clipboard, "setString").mockImplementation(() => undefined);
    try {
      await render(
        <ShareBudgetSheet
          month="2026-09-01"
          monthLabel="September 2026"
          onDismiss={jest.fn()}
          rows={ROWS}
          visible
        />,
      );

      await fireEvent.press(screen.getByRole("button", { name: "Generate share link" }));
      await fireEvent.press(screen.getByRole("button", { name: "Copy Link" }));

      expect(setString).toHaveBeenCalledTimes(1);
      expect(setString).toHaveBeenCalledWith(generatedUrl());
      expect(screen.getByText("Link copied to clipboard.")).toBeOnTheScreen();
    } finally {
      setString.mockRestore();
    }
  });

  it("opens from the BudgetsScreen header share action", async () => {
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: {
          setBudgetLimit: jest.fn().mockResolvedValue(undefined),
        },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useBudgetMonth).mockReturnValue({
      data: {
        budgets: [
          {
            id: "budget-1",
            categoryId: "cat-1",
            categoryName: "Dining",
            categoryColor: "#FF5722",
            limitMinor: 50_000,
            spentMinor: 20_000,
            syncState: "synced",
          },
        ],
        categories: [
          {
            id: "cat-1",
            name: "Dining",
            kind: "expense",
            color: "#FF5722",
            iconEmoji: "🍔",
            pending: false,
          },
        ],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<BudgetsScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Share envelopes" }));

    expect(screen.getByRole("header", { name: "Share envelopes" })).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Share Dining" })).toBeOnTheScreen();
  });
});
