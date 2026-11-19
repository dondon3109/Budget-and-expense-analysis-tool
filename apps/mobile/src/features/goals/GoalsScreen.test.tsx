import { render, screen } from "@testing-library/react-native";

import { useGoals } from "@/db/local-workspace-state";

import { GoalsScreen } from "./GoalsScreen";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/sync/sync-state", () => ({
  useSyncState: () => ({ status: "idle", retry: jest.fn() }),
}));
jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: () => ({ workspace: {} }),
  useGoals: jest.fn(),
}));

const goal = (id: string, name: string, current: number, target: number, status = "active") => ({
  id,
  name,
  currentAmountMinor: current,
  targetAmountMinor: target,
  targetDate: "2026-12-31",
  status,
  syncState: "synced",
});
const goalsState = (goals: unknown[]) =>
  ({ goals, loading: false, error: null, retry: jest.fn() }) as never;

describe("GoalsScreen", () => {
  it("offers a single add button when there are no goals", async () => {
    jest.mocked(useGoals).mockReturnValue(goalsState([]));
    await render(<GoalsScreen />);

    expect(screen.getByText("No goals yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /add goal/i })).toHaveLength(1);
  });

  it("summarizes progress and shows the amount left per goal", async () => {
    jest
      .mocked(useGoals)
      .mockReturnValue(
        goalsState([
          goal("1", "Emergency fund", 3_000_000, 6_000_000),
          goal("2", "Phone", 6_000_000, 6_000_000),
        ]),
      );
    await render(<GoalsScreen />);

    expect(screen.getByText("SAVED SO FAR")).toBeTruthy();
    expect(screen.getByText("to go")).toBeTruthy();
    expect(screen.getByText("Goal reached")).toBeTruthy();
    expect(screen.getAllByText(/by Dec 31, 2026/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Goal" })).toBeTruthy();
  });

  it("groups goals by status under section headers", async () => {
    jest
      .mocked(useGoals)
      .mockReturnValue(
        goalsState([
          goal("1", "Emergency fund", 3_000_000, 6_000_000),
          goal("2", "Laptop", 1_000_000, 5_000_000, "paused"),
          goal("3", "Phone", 6_000_000, 6_000_000, "completed"),
        ]),
      );
    await render(<GoalsScreen />);

    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText(/across 1 active goal$/)).toBeTruthy();
  });
});
