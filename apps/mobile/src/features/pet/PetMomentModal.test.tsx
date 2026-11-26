import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import type * as React from "react";
import { Platform } from "react-native";

import { petLocalDate } from "@zoption/shared";

import { checkForPlayUpdate } from "@/features/updates/play-store";
import type * as PlayStoreModule from "@/features/updates/play-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import {
  PlayUpdatePromptHost,
  resetPlayUpdatePromptStateForTests,
} from "@/features/updates/PlayUpdatePromptHost";
import {
  chooseAccountLink,
  resetAccountLinkForTests,
  setSignedInAccount,
} from "@/telemetry/account-link";
import { usePetStore } from "@/stores/pet-store";
import { PetMomentModal } from "./PetMomentModal";
import { babyPet, noPet } from "./pet-test-fixtures";

// Whether Home is the screen on top; tests cover it with another screen and bring it back.
const mockFocus = { focused: true, listeners: new Set<() => void>() };
const setHomeFocused = (focused: boolean) => {
  mockFocus.focused = focused;
  for (const listener of mockFocus.listeners) listener();
};
jest.mock("expo-router", () => {
  const { useEffect, useSyncExternalStore } = jest.requireActual<typeof React>("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (effect: () => (() => void) | void) => {
      const focused = useSyncExternalStore(
        (listener) => {
          mockFocus.listeners.add(listener);
          return () => mockFocus.listeners.delete(listener);
        },
        () => mockFocus.focused,
      );
      useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
  };
});
const mockStorage = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStorage.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStorage.delete(key)),
}));

jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { identify: jest.fn(), reset: jest.fn(async () => undefined) },
}));

jest.mock("@/features/updates/play-store", () => {
  const actual = jest.requireActual<typeof PlayStoreModule>("@/features/updates/play-store");
  return {
    ...actual,
    checkForPlayUpdate: jest.fn(async () => null),
    openPlayListing: jest.fn(async () => undefined),
  };
});

const seenBaby = { species: "hippo", stage: "baby", unwell: false, ready: false, diedAt: null };
const remember = (date: string) =>
  mockStorage.set("zoption-mobile-pet-seen-v1", JSON.stringify({ ...seenBaby, date }));

describe("PetMomentModal", () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.mocked(SecureStore.setItemAsync).mockClear();
    jest.mocked(router.push).mockClear();
    useOnboardingStore.setState({ state: { step: "complete" } as never });
    mockFocus.focused = true;
    resetAccountLinkForTests();
    resetPlayUpdatePromptStateForTests();
  });

  it("waits for the Play Store update dialog before opening", async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    jest.mocked(checkForPlayUpdate).mockResolvedValueOnce({ availableVersionCode: 20370 });

    try {
      usePetStore.setState({ pet: babyPet });
      await render(
        <>
          <PetMomentModal />
          <PlayUpdatePromptHost />
        </>,
      );

      expect(await screen.findByText("Update available")).toBeTruthy();
      expect(screen.queryByText("Bao · Baby")).toBeNull();

      await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
      expect(await screen.findByText("Bao · Baby")).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOS });
    }
  });

  it("waits for the usage-analytics choice so the two dialogs never trade places", async () => {
    usePetStore.setState({ pet: babyPet });
    await act(async () => setSignedInAccount({ id: "user-1", email: "person@example.com" }));
    await render(<PetMomentModal />);
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    expect(screen.queryByText("Bao · Baby")).toBeNull();

    await act(async () => chooseAccountLink("declined"));
    expect(await screen.findByText("Bao · Baby")).toBeTruthy();
  });

  it("shows the pet on the day's first open and links to its page", async () => {
    usePetStore.setState({ pet: babyPet });
    await render(<PetMomentModal />);
    expect(await screen.findByText("Bao · Baby")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "See my pet" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/pet");
  });

  it("stays closed once the day's pop-up was shown", async () => {
    remember(petLocalDate(Date.now()));
    usePetStore.setState({ pet: babyPet });
    await render(<PetMomentModal />);
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    expect(screen.queryByText("Bao · Baby")).toBeNull();
  });

  it("announces a death with the tombstone and a new egg button", async () => {
    remember("2026-10-05");
    usePetStore.setState({ pet: { ...noPet, name: "Bao", diedAt: "2026-10-06T01:00:00.000Z" } });
    await render(<PetMomentModal />);
    expect(await screen.findByText("Bao passed away")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a new egg" })).toBeTruthy();
  });

  it("waits for Home to be on screen, not the pet page above it", async () => {
    remember(petLocalDate(Date.now()));
    usePetStore.setState({ pet: babyPet });
    await render(<PetMomentModal />);
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());

    await act(async () => setHomeFocused(false));
    await act(async () => usePetStore.setState({ pet: { ...babyPet, stage: "juvenile" } }));
    expect(screen.queryByText("Bao is now a Juvenile!")).toBeNull();

    await act(async () => setHomeFocused(true));
    expect(await screen.findByText("Bao is now a Juvenile!")).toBeTruthy();
  });
});
