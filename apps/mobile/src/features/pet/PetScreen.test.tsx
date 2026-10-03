import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { choosePetEgg, getPet, setPetEnabled } from "@/api/pet";
import { usePetStore } from "@/stores/pet-store";
import { PetScreen } from "./PetScreen";
import { babyPet, noPet } from "./pet-test-fixtures";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<{
      useEffect: (effect: () => void, deps: unknown[]) => void;
    }>("react");
    useEffect(effect, [effect]);
  },
}));
const mockSession = { getAccessToken: async () => "token" };
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: () => mockSession }));
jest.mock("@/api/pet", () => ({
  getPet: jest.fn(),
  choosePetEgg: jest.fn(),
  setPetEnabled: jest.fn(),
}));

describe("PetScreen", () => {
  beforeEach(() => {
    jest.mocked(getPet).mockReset();
    jest.mocked(choosePetEgg).mockReset();
    jest.mocked(setPetEnabled).mockReset();
    mockBack.mockReset();
  });

  it("lets a new user pick an egg", async () => {
    usePetStore.setState({ pet: noPet });
    jest.mocked(getPet).mockResolvedValue(noPet);
    jest.mocked(choosePetEgg).mockResolvedValue({ ...noPet, species: "hippo" });
    await render(<PetScreen />);

    expect(screen.getByText("Meet your pet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Hippo egg" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose the Hippo egg" }));

    await waitFor(() => expect(usePetStore.getState().pet?.species).toBe("hippo"));
    expect(choosePetEgg).toHaveBeenCalledWith({ accessToken: "token" }, "hippo");
  });

  it("turns the pet off and leaves on Not now", async () => {
    usePetStore.setState({ pet: noPet });
    jest.mocked(getPet).mockResolvedValue(noPet);
    jest.mocked(setPetEnabled).mockResolvedValue({ ...noPet, enabled: false });
    await render(<PetScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(setPetEnabled).toHaveBeenCalledWith({ accessToken: "token" }, false);
  });

  it("shows growth, health, and today's points for a hatched pet", async () => {
    usePetStore.setState({ pet: babyPet });
    jest.mocked(getPet).mockResolvedValue(babyPet);
    await render(<PetScreen />);

    expect(screen.getByText("Panda · Baby")).toBeTruthy();
    expect(screen.getByLabelText("120 of 350 points to grow")).toBeTruthy();
    expect(screen.getByLabelText("Health 100 of 100")).toBeTruthy();
    expect(screen.getByLabelText("Today 30 of 100 points")).toBeTruthy();
  });

  it("warns when the pet is sick", async () => {
    const sick = { ...babyPet, health: 75, healthState: "sick" as const };
    usePetStore.setState({ pet: sick });
    jest.mocked(getPet).mockResolvedValue(sick);
    await render(<PetScreen />);

    expect(screen.getByRole("alert").props.children).toMatch(/eat points to heal/);
  });
});
