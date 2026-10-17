// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, screen } from "@testing-library/react";
import type { WorkspaceList } from "@zoption/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getWorkspaces: vi.fn<() => Promise<WorkspaceList>>() }));
vi.mock("../src/lib/api", () => api);
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

import { SeatRulesDialog } from "../src/components/family/SeatRulesDialog";
import {
  ActiveWorkspaceProvider,
  useActiveWorkspace,
} from "../src/components/layout/ActiveWorkspaceProvider";
import { renderWithProviders } from "./helpers/render";

const user = { id: "user-1" } as Parameters<typeof ActiveWorkspaceProvider>[0]["user"];
const STORAGE_KEY = "zoption-active-workspace:user-1";

function ActiveName() {
  const { family, workspace } = useActiveWorkspace();
  return <p>{family ? `${family.name} ${workspace.familyId}` : "Personal"}</p>;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("active workspace", () => {
  it("reopens the remembered family while the person is still in it", async () => {
    window.localStorage.setItem(STORAGE_KEY, "family:abc");
    api.getWorkspaces.mockResolvedValue({
      workspaces: [{ id: "family:abc", kind: "family", name: "Dela Cruz", role: "member" }],
      familiesAvailable: true,
    });

    renderWithProviders(
      <ActiveWorkspaceProvider user={user}>
        <ActiveName />
      </ActiveWorkspaceProvider>,
    );

    expect(await screen.findByText("Dela Cruz family:abc")).toBeInTheDocument();
  });

  it("falls back to the personal workspace once that family is gone", async () => {
    window.localStorage.setItem(STORAGE_KEY, "family:left");
    api.getWorkspaces.mockResolvedValue({ workspaces: [], familiesAvailable: true });

    renderWithProviders(
      <ActiveWorkspaceProvider user={user}>
        <ActiveName />
      </ActiveWorkspaceProvider>,
    );

    expect(await screen.findByText("Personal")).toBeInTheDocument();
  });
});

describe("seat rules", () => {
  it("unlocks the confirm button only after ten seconds", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderWithProviders(
      <SeatRulesDialog
        title="Create Dela Cruz"
        confirmLabel="Create family"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Create family (10)" })).toBeDisabled();
    for (let second = 0; second < 10; second += 1) {
      act(() => void vi.advanceTimersByTime(1000));
    }
    screen.getByRole("button", { name: "Create family" }).click();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});
