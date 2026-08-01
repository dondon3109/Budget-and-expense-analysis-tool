// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted<{ user: { id: string } | null }>(() => ({
  user: { id: "user-1" },
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

import {
  InitialDashboardExperienceProvider,
  useInitialDashboardExperience,
} from "../src/components/dashboard/InitialDashboardExperienceProvider";

function ExperienceProbe() {
  const { hasCompletedInitialDashboardExperience, completeInitialDashboardExperience } =
    useInitialDashboardExperience();

  return (
    <>
      <output data-testid="completed">{String(hasCompletedInitialDashboardExperience)}</output>
      <button type="button" onClick={completeInitialDashboardExperience}>
        Complete startup
      </button>
    </>
  );
}

function TestTree({ showProbe = true }: { showProbe?: boolean }) {
  return (
    <InitialDashboardExperienceProvider>
      {showProbe && <ExperienceProbe />}
    </InitialDashboardExperienceProvider>
  );
}

describe("InitialDashboardExperienceProvider", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
  });

  afterEach(cleanup);

  it("replays startup after sign-out while preserving it during an authenticated session", () => {
    const view = render(<TestTree />);

    expect(screen.getByTestId("completed")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Complete startup" }));
    expect(screen.getByTestId("completed")).toHaveTextContent("true");

    authState.user = { id: "user-1" };
    view.rerender(<TestTree />);
    expect(screen.getByTestId("completed")).toHaveTextContent("true");

    view.rerender(<TestTree showProbe={false} />);
    view.rerender(<TestTree />);
    expect(screen.getByTestId("completed")).toHaveTextContent("true");

    authState.user = null;
    view.rerender(<TestTree />);

    authState.user = { id: "user-1" };
    view.rerender(<TestTree />);
    expect(screen.getByTestId("completed")).toHaveTextContent("false");
  });
});
