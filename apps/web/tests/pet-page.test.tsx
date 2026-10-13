// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PetView } from "@zoption/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ loading: false, user: { id: "user-1" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "checkInPet",
    "choosePetEgg",
    "setPetEnabled",
  ]),
);

import { PetMomentDialog } from "../src/components/pet/PetMomentDialog";
import { checkInPet, choosePetEgg } from "../src/lib/api";
import { PetPage } from "../src/pages/PetPage";
import { renderWithProviders } from "./helpers/render";

const babyPet: PetView = {
  enabled: true,
  species: "panda",
  stage: "baby",
  points: 120,
  nextStagePoints: 350,
  pointsToday: 30,
  eggStreakDays: 7,
  eggHatchDays: 7,
  health: 100,
  healthState: "healthy",
  lastActivityAt: "2026-10-03T01:00:00.000Z",
  diedAt: null,
};
const noPet: PetView = {
  ...babyPet,
  species: null,
  stage: "egg",
  points: 0,
  nextStagePoints: null,
  pointsToday: 0,
  eggStreakDays: 0,
  health: null,
  healthState: null,
  lastActivityAt: null,
};

describe("pet on the web", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(checkInPet).mockReset();
    vi.mocked(choosePetEgg).mockReset();
  });
  afterEach(cleanup);

  it("lets a new user pick an egg", async () => {
    vi.mocked(checkInPet).mockResolvedValue(noPet);
    vi.mocked(choosePetEgg).mockResolvedValue({ ...noPet, species: "hippo" });
    renderWithProviders(<PetPage />);

    fireEvent.click(await screen.findByRole("radio", { name: "Hippo" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose the Hippo egg" }));

    expect(await screen.findByRole("heading", { name: "Hippo · Egg" })).toBeInTheDocument();
    expect(vi.mocked(choosePetEgg).mock.calls[0]?.[1]).toBe("hippo");
  });

  it("shows the pet pop-up once per day", async () => {
    vi.mocked(checkInPet).mockResolvedValue(babyPet);
    const workspace = { key: "user:user-1", userId: "user-1" } as const;
    renderWithProviders(<PetMomentDialog workspace={workspace} />);

    expect(await screen.findByRole("dialog", { name: "Panda · Baby" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    cleanup();

    renderWithProviders(<PetMomentDialog workspace={workspace} />);
    await waitFor(() => expect(checkInPet).toHaveBeenCalledTimes(2));
    // Let the second check-in land and the pop-up decide.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
