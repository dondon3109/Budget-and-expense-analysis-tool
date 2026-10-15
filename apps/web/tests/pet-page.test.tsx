// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { BillingSummary, PetView } from "@zoption/shared";
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
    "hatchPet",
    "getBillingSummary",
  ]),
);

vi.mock("../src/lib/petSounds", () => ({
  playPetReaction: vi.fn(),
  warmUpPetVoices: vi.fn(),
}));

import { PetMomentDialog } from "../src/components/pet/PetMomentDialog";
import { checkInPet, choosePetEgg, getBillingSummary, hatchPet } from "../src/lib/api";
import { playPetReaction } from "../src/lib/petSounds";
import { PetPage } from "../src/pages/PetPage";
import { renderWithProviders } from "./helpers/render";

const babyPet: PetView = {
  enabled: true,
  species: "panda",
  name: "Bao",
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
  name: null,
  stage: "egg",
  points: 0,
  nextStagePoints: null,
  pointsToday: 0,
  eggStreakDays: 0,
  health: null,
  healthState: null,
  lastActivityAt: null,
};

function billingSummary(plan: "free" | "zoption_pro"): BillingSummary {
  return {
    plan,
    entitlementSource: null,
    provider: null,
    status: null,
    interval: null,
    currentPeriodEndsAt: null,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: null,
    canCheckout: plan === "free",
    canManageBilling: false,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 0,
    usages: [],
    allowances: [],
  };
}

describe("pet on the web", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(checkInPet).mockReset();
    vi.mocked(choosePetEgg).mockReset();
    vi.mocked(hatchPet).mockReset();
    vi.mocked(getBillingSummary).mockReset();
    vi.mocked(getBillingSummary).mockResolvedValue(billingSummary("zoption_pro"));
  });
  afterEach(cleanup);

  it("lets a new user pick an egg", async () => {
    vi.mocked(checkInPet).mockResolvedValue(noPet);
    vi.mocked(choosePetEgg).mockResolvedValue({ ...noPet, species: "hippo", name: "Gloria" });
    renderWithProviders(<PetPage />);

    fireEvent.click(await screen.findByRole("radio", { name: "Hippo" }));
    expect(screen.getByRole("button", { name: "Give it a name" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Name your pet" }), {
      target: { value: " Gloria " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose the Hippo egg" }));

    expect(await screen.findByRole("heading", { name: "Gloria" })).toBeInTheDocument();
    expect(vi.mocked(choosePetEgg).mock.calls[0]?.[1]).toEqual({
      species: "hippo",
      name: "Gloria",
    });
  });

  it("hatches a ready egg on the tenth click", async () => {
    vi.mocked(checkInPet).mockResolvedValue({ ...noPet, species: "panda", eggStreakDays: 7 });
    vi.mocked(hatchPet).mockResolvedValue(babyPet);
    renderWithProviders(<PetPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Ready egg/ }));
    expect(screen.getByText("9 more clicks…")).toBeInTheDocument();
    for (let click = 1; click < 10; click += 1) {
      fireEvent.click(screen.getByRole("button", { name: /Ready egg/ }));
    }

    expect(await screen.findByRole("heading", { name: "Bao" })).toBeInTheDocument();
    expect(hatchPet).toHaveBeenCalledTimes(1);
  });

  it("settles a ready egg back when the hatch fails", async () => {
    vi.mocked(checkInPet).mockResolvedValue({ ...noPet, species: "panda", eggStreakDays: 7 });
    vi.mocked(hatchPet).mockRejectedValue(new Error("offline"));
    renderWithProviders(<PetPage />);

    const egg = await screen.findByRole("button", { name: /Ready egg/ });
    for (let click = 0; click < 10; click += 1) fireEvent.click(egg);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't hatch, try again.");
    expect(screen.getByRole("button", { name: /Click 10 more times/ })).toBeInTheDocument();
  });

  it("marks the current stage on the growth path and hearts a petted pet", async () => {
    vi.mocked(checkInPet).mockResolvedValue(babyPet);
    renderWithProviders(<PetPage />);

    const path = await screen.findByRole("list", { name: "Growth path" });
    expect(path.querySelector('[aria-current="step"]')).toHaveTextContent("Baby");
    const pet = screen.getByRole("button", { name: "Pet Bao" });
    expect(pet.querySelector(".pet-hearts")).toBeNull();
    fireEvent.click(pet);
    expect(pet.querySelector(".pet-hearts")).toHaveTextContent("💖");
    expect(playPetReaction).toHaveBeenLastCalledWith("panda", "baby", "happy");
  });

  it("answers a click on a sick pet weakly, in its sad voice", async () => {
    vi.mocked(checkInPet).mockResolvedValue({ ...babyPet, health: 75, healthState: "sick" });
    renderWithProviders(<PetPage />);

    const pet = await screen.findByRole("button", { name: "Pet Bao" });
    fireEvent.click(pet);

    expect(pet.querySelector(".pet-hearts")).toHaveTextContent("🤒");
    expect(pet.querySelector(".pet-hearts")).not.toHaveTextContent("💖");
    expect(playPetReaction).toHaveBeenLastCalledWith("panda", "baby", "sick");
  });

  it("tells a free user their pet needs Pro to grow", async () => {
    vi.mocked(checkInPet).mockResolvedValue(babyPet);
    vi.mocked(getBillingSummary).mockResolvedValue(billingSummary("free"));
    renderWithProviders(<PetPage />);

    expect(
      await screen.findByText(/Growing into a Juvenile needs Zoption Pro\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Zoption Pro" })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
  });

  it("shows the pet pop-up once per day", async () => {
    vi.mocked(checkInPet).mockResolvedValue(babyPet);
    const workspace = { key: "user:user-1", userId: "user-1" } as const;
    renderWithProviders(<PetMomentDialog workspace={workspace} />);

    expect(await screen.findByRole("dialog", { name: "Bao · Baby" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    cleanup();

    renderWithProviders(<PetMomentDialog workspace={workspace} />);
    await waitFor(() => expect(checkInPet).toHaveBeenCalledTimes(2));
    // Let the second check-in land and the pop-up decide.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
