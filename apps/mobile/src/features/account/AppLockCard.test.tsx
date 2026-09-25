import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type * as NodeCrypto from "crypto";

const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureValues.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureValues.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureValues.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: () => "salt",
  digestStringAsync: (_algorithm: string, value: string) =>
    Promise.resolve(
      jest
        .requireActual<typeof NodeCrypto>("crypto")
        .createHash("sha256")
        .update(value)
        .digest("hex"),
    ),
}));

import { readAppLockKind, verifyAppLock } from "@/auth/app-lock";

import { AppLockCard } from "./AppLockCard";

const subject = "08060c19-8a55-4046-a2e7-7384808dd81c";

async function enterPin(pin: string) {
  for (const digit of pin) {
    await fireEvent.press(screen.getByLabelText(digit));
  }
}

describe("AppLockCard", () => {
  beforeEach(() => mockSecureValues.clear());

  it("turns the lock on with a confirmed PIN and off with the current one", async () => {
    await act(async () => {
      render(<AppLockCard subject={subject} />);
    });

    await fireEvent.press(screen.getByText("Turn on app lock"));
    await enterPin("246810");
    await enterPin("111111");
    expect(await screen.findByText("The PINs did not match. Start again.")).toBeTruthy();

    await enterPin("246810");
    await enterPin("246810");
    expect(await screen.findByText(/App lock is on/)).toBeTruthy();
    await expect(verifyAppLock(subject, "246810")).resolves.toBe(true);

    await fireEvent.press(screen.getByText("Turn off app lock"));
    await enterPin("000000");
    expect(await screen.findByText("Incorrect PIN. Try again.")).toBeTruthy();
    await enterPin("246810");
    expect(await screen.findByText("App lock is off.")).toBeTruthy();
    await expect(readAppLockKind(subject)).resolves.toBeNull();
  });
});
