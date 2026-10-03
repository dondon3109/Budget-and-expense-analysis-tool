import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { PetView } from "@zoption/shared";

import { setPetEnabled } from "@/api/pet";
import { usePetStore } from "@/stores/pet-store";
import { PetSettingsCard } from "./PetSettingsCard";

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ getAccessToken: async () => "token" }),
}));
jest.mock("@/api/pet", () => ({ setPetEnabled: jest.fn() }));

const pet: PetView = {
  enabled: true,
  species: "hippo",
  stage: "baby",
  points: 40,
  nextStagePoints: 350,
  pointsToday: 20,
  eggStreakDays: 7,
  eggHatchDays: 7,
  health: 100,
  healthState: "healthy",
  lastActivityAt: "2026-10-03T01:00:00.000Z",
  diedAt: null,
};

describe("PetSettingsCard", () => {
  beforeEach(() => {
    usePetStore.setState({ pet: null });
    jest.mocked(setPetEnabled).mockReset();
  });

  it("stays hidden until the Worker has answered", async () => {
    await render(<PetSettingsCard />);
    expect(screen.queryByText("Pet companion")).toBeNull();
  });

  it("turns the pet off and shows the saved choice", async () => {
    usePetStore.setState({ pet });
    jest.mocked(setPetEnabled).mockResolvedValue({ ...pet, enabled: false });
    await render(<PetSettingsCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Pet companion, On" }));
    await fireEvent(screen.getByLabelText("Show my pet"), "valueChange", false);

    await waitFor(() => expect(usePetStore.getState().pet?.enabled).toBe(false));
    expect(setPetEnabled).toHaveBeenCalledWith({ accessToken: "token" }, false);
    expect(screen.getByRole("button", { name: "Pet companion, Off" })).toBeTruthy();
  });

  it("says so when the change fails", async () => {
    usePetStore.setState({ pet });
    jest.mocked(setPetEnabled).mockRejectedValue(new Error("offline"));
    await render(<PetSettingsCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Pet companion, On" }));
    await fireEvent(screen.getByLabelText("Show my pet"), "valueChange", false);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(usePetStore.getState().pet?.enabled).toBe(true);
  });
});
