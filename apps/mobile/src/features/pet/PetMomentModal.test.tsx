import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { petLocalDate } from "@zoption/shared";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";
import { PetMomentModal } from "./PetMomentModal";
import { babyPet, noPet } from "./pet-test-fixtures";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const mockStorage = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStorage.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStorage.delete(key)),
}));

const seenBaby = { species: "panda", stage: "baby", unwell: false, diedAt: null };
const remember = (date: string) =>
  mockStorage.set("zoption-mobile-pet-seen-v1", JSON.stringify({ ...seenBaby, date }));

describe("PetMomentModal", () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(router.push).mockClear();
    useOnboardingStore.setState({ state: { step: "complete" } as never });
  });

  it("shows the pet on the day's first open and links to its page", async () => {
    usePetStore.setState({ pet: babyPet });
    await render(<PetMomentModal />);
    expect(await screen.findByText("Panda · Baby")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "See my pet" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/pet");
  });

  it("stays closed once the day's pop-up was shown", async () => {
    remember(petLocalDate(Date.now()));
    usePetStore.setState({ pet: babyPet });
    await render(<PetMomentModal />);
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    expect(screen.queryByText("Panda · Baby")).toBeNull();
  });

  it("announces a death with the tombstone and a new egg button", async () => {
    remember("2026-10-05");
    usePetStore.setState({ pet: { ...noPet, diedAt: "2026-10-06T01:00:00.000Z" } });
    await render(<PetMomentModal />);
    expect(await screen.findByText("Your panda passed away")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a new egg" })).toBeTruthy();
  });
});
