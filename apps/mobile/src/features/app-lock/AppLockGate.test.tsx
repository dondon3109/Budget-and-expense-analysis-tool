import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type * as NodeCrypto from "crypto";
import { AppState, Platform, Text, type AppStateStatus } from "react-native";

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

const mockBiometrics = { level: 0, succeed: true };
jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(() => Promise.resolve(mockBiometrics.level)),
  authenticateAsync: jest.fn(() =>
    Promise.resolve(
      mockBiometrics.succeed ? { success: true } : { success: false, error: "user_cancel" },
    ),
  ),
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

import * as LocalAuthentication from "expo-local-authentication";

import {
  clearAppLock,
  readAppLockKind,
  readBiometricUnlock,
  setAppLock,
  setBiometricUnlock,
  verifyAppLock,
} from "@/auth/app-lock";
import { UnsyncedChangesError } from "@/auth/sign-out-policy";

import { AppLockGate, MAX_ATTEMPTS, RELOCK_AFTER_MS } from "./AppLockGate";

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
    mockBiometrics.level = 0;
    mockBiometrics.succeed = true;
    jest.mocked(LocalAuthentication.authenticateAsync).mockClear();
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

  it("clears biometric unlock with the lock", async () => {
    await setAppLock(subject, "482913");
    await setBiometricUnlock(subject, true);
    await expect(readBiometricUnlock(subject)).resolves.toBe(true);

    await clearAppLock(subject);
    await expect(readBiometricUnlock(subject)).resolves.toBe(false);
  });

  it("unlocks with biometrics when they are on and enrolled", async () => {
    mockBiometrics.level = 3;
    await setAppLock(subject, "482913");
    await setBiometricUnlock(subject, true);
    await renderGate();

    await waitFor(() => expect(screen.queryByText("Zoption is locked")).toBeNull());
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: true }),
    );
  });

  it("falls back to the PIN pad when the biometric prompt is cancelled", async () => {
    mockBiometrics.level = 3;
    mockBiometrics.succeed = false;
    await setAppLock(subject, "482913");
    await setBiometricUnlock(subject, true);
    await renderGate();

    expect(await screen.findByText("Unlock with biometrics")).toBeTruthy();
    expect(screen.getByText("Zoption is locked")).toBeTruthy();

    mockBiometrics.succeed = true;
    await fireEvent.press(screen.getByText("Unlock with biometrics"));
    await waitFor(() => expect(screen.queryByText("Zoption is locked")).toBeNull());
  });

  it("unlocks with a weak Android biometric such as camera face unlock", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockBiometrics.level = 2;
    await setAppLock(subject, "482913");
    await setBiometricUnlock(subject, true);
    await renderGate();

    await waitFor(() => expect(screen.queryByText("Zoption is locked")).toBeNull());
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ biometricsSecurityLevel: "weak" }),
    );
    jest.restoreAllMocks();
  });

  it("does not offer biometrics when none is enrolled", async () => {
    mockBiometrics.level = 1;
    await setAppLock(subject, "482913");
    await setBiometricUnlock(subject, true);
    await renderGate();

    expect(screen.getByText("Zoption is locked")).toBeTruthy();
    expect(screen.queryByText("Unlock with biometrics")).toBeNull();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
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

  it("asks for the legacy password again when it relocks during PIN replacement", async () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
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

    await act(async () => {
      appStateListener?.("background");
      now.mockReturnValue(1_000 + RELOCK_AFTER_MS + 1);
      appStateListener?.("active");
    });

    expect(await screen.findByLabelText("App password")).toBeTruthy();
    expect(screen.queryByText("Create a PIN")).toBeNull();
    jest.restoreAllMocks();
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
