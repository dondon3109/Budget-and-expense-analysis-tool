import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type * as NodeCrypto from "crypto";
import { Text } from "react-native";

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

let mockUuid = 0;
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: () => `salt-${++mockUuid}`,
  digestStringAsync: (_algorithm: string, value: string) =>
    Promise.resolve(
      jest
        .requireActual<typeof NodeCrypto>("crypto")
        .createHash("sha256")
        .update(value)
        .digest("hex"),
    ),
}));

const mockSignOut = jest.fn();
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ signOut: mockSignOut }),
}));

import { clearAppLock, readAppLockKind, setAppLock, verifyAppLock } from "@/auth/app-lock";
import { UnsyncedChangesError } from "@/auth/sign-out-policy";

import { AppLockGate, MAX_ATTEMPTS } from "./AppLockGate";

const subject = "08060c19-8a55-4046-a2e7-7384808dd81c";

async function enterPin(pin: string) {
  for (const digit of pin) {
    await fireEvent.press(screen.getByLabelText(digit));
  }
}

async function renderGate() {
  await act(async () => {
    render(
      <AppLockGate subject={subject}>
        <Text>Workspace content</Text>
      </AppLockGate>,
    );
  });
}

describe("app lock", () => {
  beforeEach(() => {
    mockSecureValues.clear();
    mockSignOut.mockReset().mockResolvedValue(undefined);
  });

  it("stores only a salted hash and verifies per subject", async () => {
    await setAppLock(subject, "482913");

    const stored = mockSecureValues.get(`zoption.app_lock.${subject}`) ?? "";
    expect(stored).not.toContain("482913");
    await expect(readAppLockKind(subject)).resolves.toBe("pin");
    await expect(verifyAppLock(subject, "482913")).resolves.toBe(true);
    await expect(verifyAppLock(subject, "000000")).resolves.toBe(false);
    await expect(readAppLockKind("another-subject")).resolves.toBeNull();

    await clearAppLock(subject);
    await expect(readAppLockKind(subject)).resolves.toBeNull();
  });

  it("accepts only a six-digit PIN", async () => {
    await expect(setAppLock(subject, "1234")).rejects.toThrow("6 digits");
    await expect(setAppLock(subject, "12345a")).rejects.toThrow("6 digits");
  });

  it("fails closed on an unreadable lock record", async () => {
    mockSecureValues.set(`zoption.app_lock.${subject}`, "not json");
    await expect(readAppLockKind(subject)).resolves.toBe("pin");
    await expect(verifyAppLock(subject, "anything")).resolves.toBe(false);
  });

  it("opens straight into the workspace when no app lock is set", async () => {
    await renderGate();
    expect(screen.getByText("Workspace content")).toBeTruthy();
    expect(screen.queryByText("Zoption is locked")).toBeNull();
  });

  it("unlocks only with the right PIN, submitting on the last digit", async () => {
    await setAppLock(subject, "482913");
    await renderGate();
    expect(screen.getByText("Zoption is locked")).toBeTruthy();

    await enterPin("000000");
    expect(await screen.findByText("Incorrect PIN. Try again.")).toBeTruthy();
    expect(screen.getByLabelText("0 of 6 digits entered")).toBeTruthy();

    await enterPin("48291");
    await fireEvent.press(screen.getByLabelText("Delete digit"));
    await enterPin("13");
    await waitFor(() => expect(screen.queryByText("Zoption is locked")).toBeNull());
  });

  it("pauses attempts after repeated wrong PINs", async () => {
    await setAppLock(subject, "482913");
    await renderGate();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await enterPin("000000");
      await waitFor(() => expect(screen.getByLabelText("0 of 6 digits entered")).toBeTruthy());
    }

    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    expect(screen.getByLabelText("1").props.accessibilityState.disabled).toBe(true);
  });

  it("replaces a legacy app password with a PIN after one unlock", async () => {
    mockSecureValues.set(
      `zoption.app_lock.${subject}`,
      JSON.stringify({
        version: 1,
        salt: "legacy",
        hash: jest
          .requireActual<typeof NodeCrypto>("crypto")
          .createHash("sha256")
          .update("legacy:correct horse")
          .digest("hex"),
      }),
    );
    await renderGate();

    await fireEvent.changeText(screen.getByLabelText("App password"), "correct horse");
    await fireEvent.press(screen.getByText("Continue"));
    expect(await screen.findByText("Create a PIN")).toBeTruthy();

    await enterPin("135790");
    expect(await screen.findByText("Confirm your PIN")).toBeTruthy();
    await enterPin("135790");

    await waitFor(() => expect(screen.queryByText("Confirm your PIN")).toBeNull());
    await expect(readAppLockKind(subject)).resolves.toBe("pin");
    await expect(verifyAppLock(subject, "135790")).resolves.toBe(true);
  });

  it("asks before discarding unsynced changes when signing out from the lock", async () => {
    await setAppLock(subject, "482913");
    mockSignOut.mockRejectedValueOnce(
      new UnsyncedChangesError({ unsyncedOperationCount: 2, unresolvedConflictCount: 0 }),
    );
    await renderGate();

    await fireEvent.press(screen.getByText("Forgot PIN? Sign out"));
    await fireEvent.press(screen.getByText("Sign out"));
    expect(mockSignOut).toHaveBeenLastCalledWith({ discardUnsyncedChanges: false });

    await fireEvent.press(await screen.findByText("Delete unsynced changes and sign out"));
    expect(mockSignOut).toHaveBeenLastCalledWith({ discardUnsyncedChanges: true });
  });
});
