import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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

import { readAppLockKind, setAppLock, verifyAppLock } from "@/auth/app-lock";
import { MAX_ATTEMPTS } from "@/features/app-lock/AppLockGate";

import { AppLockCard } from "./AppLockCard";

async function renderCard() {
  await act(async () => {
    render(<AppLockCard subject={subject} />);
  });
}

const subject = "08060c19-8a55-4046-a2e7-7384808dd81c";

async function enterPin(pin: string) {
  for (const digit of pin) {
    await fireEvent.press(screen.getByLabelText(digit));
  }
}

describe("AppLockCard", () => {
  beforeEach(() => mockSecureValues.clear());

  it("turns the lock on with a confirmed PIN and off with the current one", async () => {
    await renderCard();

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

  it("changes the PIN only after the current one checks out", async () => {
    await setAppLock(subject, "246810");
    await renderCard();

    await fireEvent.press(screen.getByText("Change PIN"));
    await enterPin("246810");
    expect(await screen.findByText("Create a PIN")).toBeTruthy();
    await enterPin("135790");
    await enterPin("135790");

    expect(await screen.findByText(/App lock is on/)).toBeTruthy();
    await expect(verifyAppLock(subject, "246810")).resolves.toBe(false);
    await expect(verifyAppLock(subject, "135790")).resolves.toBe(true);
  });

  it("pauses current-PIN checks after repeated wrong entries", async () => {
    await setAppLock(subject, "246810");
    await renderCard();

    await fireEvent.press(screen.getByText("Turn off app lock"));
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await enterPin("000000");
      await waitFor(() => expect(screen.getByLabelText("0 of 6 digits entered")).toBeTruthy());
    }

    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    expect(screen.getByLabelText("1").props.accessibilityState.disabled).toBe(true);
    await expect(readAppLockKind(subject)).resolves.toBe("pin");
  });

  it("does not offer the number pad for a legacy app password", async () => {
    mockSecureValues.set(
      `zoption.app_lock.${subject}`,
      JSON.stringify({ version: 1, salt: "legacy", hash: "legacy-hash" }),
    );
    await renderCard();

    expect(screen.getByText(/still uses a password/)).toBeTruthy();
    expect(screen.queryByText("Change PIN")).toBeNull();
    expect(screen.queryByText("Turn off app lock")).toBeNull();
  });
});
