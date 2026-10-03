import { render, screen } from "@testing-library/react-native";

import { usePetStore } from "@/stores/pet-store";
import { PetHomeCard } from "./PetHomeCard";
import { babyPet, noPet } from "./pet-test-fixtures";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

describe("PetHomeCard", () => {
  it.each([
    ["no pet view", null],
    ["a pet turned off", { ...babyPet, enabled: false }],
    ["no egg picked yet", noPet],
  ])("is hidden with %s", async (_name, pet) => {
    usePetStore.setState({ pet });
    await render(<PetHomeCard />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the pet and how it is doing", async () => {
    usePetStore.setState({ pet: babyPet });
    await render(<PetHomeCard />);
    expect(
      screen.getByRole("button", { name: "Panda · Baby. 120 of 350 points to grow." }),
    ).toBeTruthy();
  });

  it("asks for a new egg after the pet dies", async () => {
    usePetStore.setState({ pet: { ...noPet, diedAt: "2026-10-06T01:00:00.000Z" } });
    await render(<PetHomeCard />);
    expect(screen.getByText("Your pet passed away. Pick a new egg.")).toBeTruthy();
  });
});
