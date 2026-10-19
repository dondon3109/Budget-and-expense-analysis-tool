import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { choosePetEgg, getPet, hatchPet, setPetColor, setPetEnabled } from "@/api/pet";
import { usePetStore } from "@/stores/pet-store";
import { PetScreen } from "./PetScreen";
import { babyPet, noPet } from "./pet-test-fixtures";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<{
      useEffect: (effect: () => void, deps: unknown[]) => void;
    }>("react");
    useEffect(effect, [effect]);
  },
}));
const mockSession = { getAccessToken: async () => "token" };
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: () => mockSession }));
let mockPlan = { plan: "zoption_pro", status: "ready" };
jest.mock("@/auth/plan-state", () => ({ usePlan: () => mockPlan }));
jest.mock("@/api/pet", () => ({
  getPet: jest.fn(),
  choosePetEgg: jest.fn(),
  setPetEnabled: jest.fn(),
  setPetColor: jest.fn(),
  hatchPet: jest.fn(),
}));

describe("PetScreen", () => {
  beforeEach(() => {
    jest.mocked(getPet).mockReset();
    jest.mocked(choosePetEgg).mockReset();
    jest.mocked(setPetEnabled).mockReset();
    jest.mocked(hatchPet).mockReset();
    jest.mocked(setPetColor).mockReset();
    mockBack.mockReset();
    mockPush.mockReset();
    mockPlan = { plan: "zoption_pro", status: "ready" };
  });

  it("lets a new user pick an egg", async () => {
    usePetStore.setState({ pet: noPet });
    jest.mocked(getPet).mockResolvedValue(noPet);
    jest.mocked(choosePetEgg).mockResolvedValue({ ...noPet, species: "hippo" });
    await render(<PetScreen />);

    expect(screen.getByText("Meet your pet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Hippo egg" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Pink" }));
    expect(screen.getByRole("button", { name: "Give it a name" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Name your pet"), "  Gloria ");
    await fireEvent.press(screen.getByRole("button", { name: "Choose the Hippo egg" }));

    await waitFor(() => expect(usePetStore.getState().pet?.species).toBe("hippo"));
    expect(choosePetEgg).toHaveBeenCalledWith({ accessToken: "token" }, "hippo", "Gloria", "pink");
  });

  it("asks the owner of a pet from before colors to pick one, once", async () => {
    const older = { ...babyPet, color: null };
    usePetStore.setState({ pet: older });
    jest.mocked(getPet).mockResolvedValue(older);
    jest.mocked(setPetColor).mockResolvedValue(babyPet);
    await render(<PetScreen />);

    expect(await screen.findByText("Pick a color for Bao")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Keep original" }));

    await waitFor(() => expect(screen.queryByText("Pick a color for Bao")).toBeNull());
    expect(setPetColor).toHaveBeenCalledWith({ accessToken: "token" }, "original");
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

    expect(screen.getByText("Bao")).toBeTruthy();
    expect(screen.getByText("Panda · Baby")).toBeTruthy();
    expect(screen.getByLabelText("120 of 350 points to grow")).toBeTruthy();
    expect(screen.getByLabelText("Health 100 of 100")).toBeTruthy();
    expect(screen.getByLabelText("Today 30 of 100 points")).toBeTruthy();
    expect(screen.queryByText("Growing into a Juvenile needs Zoption Pro.")).toBeNull();
  });

  it("tells a free user their pet needs Pro to grow", async () => {
    mockPlan = { plan: "free", status: "ready" };
    usePetStore.setState({ pet: babyPet });
    jest.mocked(getPet).mockResolvedValue(babyPet);
    await render(<PetScreen />);
    expect(screen.getByText("Growing into a Juvenile needs Zoption Pro.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "See paid plans" }));
    expect(mockPush).toHaveBeenCalledWith("/(app)/plan-billing");
  });

  it("shows the pet's place on the growth path and lets the user pet it", async () => {
    usePetStore.setState({ pet: babyPet });
    jest.mocked(getPet).mockResolvedValue(babyPet);
    await render(<PetScreen />);

    expect(screen.getByLabelText("Growth path: Baby now")).toBeTruthy();
    expect(screen.queryByText("💖")).toBeNull();
    await fireEvent.press(screen.getByRole("imagebutton", { name: "Bao, Panda · Baby" }));
    expect(screen.getAllByText("💖").length).toBeGreaterThan(0);
  });

  it("answers a tap on a sick pet weakly, with no hearts", async () => {
    const sick = { ...babyPet, health: 75, healthState: "sick" as const };
    usePetStore.setState({ pet: sick });
    jest.mocked(getPet).mockResolvedValue(sick);
    await render(<PetScreen />);

    await fireEvent.press(screen.getByRole("imagebutton", { name: "Bao, Panda · Baby" }));

    expect(screen.getByText("🤒")).toBeTruthy();
    expect(screen.queryByText("💖")).toBeNull();
  });

  it("warns when the pet is sick", async () => {
    const sick = { ...babyPet, health: 75, healthState: "sick" as const };
    usePetStore.setState({ pet: sick });
    jest.mocked(getPet).mockResolvedValue(sick);
    await render(<PetScreen />);

    expect(screen.getByRole("alert").props.children).toMatch(/eat points to heal/);
  });

  describe("a ready egg", () => {
    const readyEgg = { ...noPet, species: "panda" as const, eggStreakDays: 7 };
    const tapTenTimes = async () => {
      for (let tap = 0; tap < 10; tap += 1) {
        await fireEvent.press(screen.getByRole("imagebutton"));
      }
    };

    beforeEach(() => {
      usePetStore.setState({ pet: readyEgg });
      jest.mocked(getPet).mockResolvedValue(readyEgg);
    });

    it("hatches only on the tenth tap", async () => {
      jest.mocked(hatchPet).mockResolvedValue(babyPet);
      await render(<PetScreen />);

      await fireEvent.press(screen.getByRole("imagebutton"));
      expect(screen.getByText("9 more taps…")).toBeTruthy();
      expect(hatchPet).not.toHaveBeenCalled();

      for (let tap = 1; tap < 10; tap += 1) {
        await fireEvent.press(screen.getByRole("imagebutton"));
      }
      await waitFor(() => expect(usePetStore.getState().pet?.stage).toBe("baby"));
      expect(hatchPet).toHaveBeenCalledTimes(1);
    });

    it("settles back when the hatch fails", async () => {
      jest.mocked(hatchPet).mockRejectedValue(new Error("offline"));
      await render(<PetScreen />);

      await tapTenTimes();

      await waitFor(() => expect(screen.getByText("Couldn't hatch, try again.")).toBeTruthy());
      expect(usePetStore.getState().pet?.stage).toBe("egg");
    });
  });
});
