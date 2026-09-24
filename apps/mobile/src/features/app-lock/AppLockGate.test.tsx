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

import { clearAppLock, hasAppLock, setAppLock, verifyAppLock } from "@/auth/app-lock";
import { UnsyncedChangesError } from "@/auth/sign-out-policy";

import { AppLockGate, MAX_ATTEMPTS } from "./AppLockGate";

const subject = "08060c19-8a55-4046-a2e7-7384808dd81c";

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
    await setAppLock(subject, "4321");

    const stored = mockSecureValues.get(`zoption.app_lock.${subject}`) ?? "";
    expect(stored).not.toContain("4321");
    await expect(verifyAppLock(subject, "4321")).resolves.toBe(true);
    await expect(verifyAppLock(subject, "0000")).resolves.toBe(false);
    await expect(hasAppLock("another-subject")).resolves.toBe(false);

    await clearAppLock(subject);
    await expect(hasAppLock(subject)).resolves.toBe(false);
  });

  it("rejects a password shorter than the minimum", async () => {
    await expect(setAppLock(subject, "123")).rejects.toThrow("at least 4");
  });

  it("fails closed on an unreadable lock record", async () => {
    mockSecureValues.set(`zoption.app_lock.${subject}`, "not json");
    await expect(hasAppLock(subject)).resolves.toBe(true);
    await expect(verifyAppLock(subject, "anything")).resolves.toBe(false);
  });

  it("opens straight into the workspace when no app lock is set", async () => {
    await renderGate();
    expect(screen.getByText("Workspace content")).toBeTruthy();
    expect(screen.queryByText("Zoption is locked")).toBeNull();
  });

  it("unlocks only with the right password", async () => {
    await setAppLock(subject, "4321");
    await renderGate();
    expect(screen.getByText("Zoption is locked")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("App password"), "0000");
    await fireEvent.press(screen.getByText("Unlock"));
    expect(await screen.findByText("That password is not correct.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("App password"), "4321");
    await fireEvent.press(screen.getByText("Unlock"));
    await waitFor(() => expect(screen.queryByText("Zoption is locked")).toBeNull());
  });

  it("pauses attempts after repeated wrong passwords", async () => {
    await setAppLock(subject, "4321");
    await renderGate();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await fireEvent.changeText(screen.getByLabelText("App password"), "0000");
      await fireEvent.press(screen.getByText("Unlock"));
    }

    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    expect(screen.getByLabelText("App password").props.editable).toBe(false);
  });

  it("asks before discarding unsynced changes when signing out from the lock", async () => {
    await setAppLock(subject, "4321");
    mockSignOut.mockRejectedValueOnce(
      new UnsyncedChangesError({ unsyncedOperationCount: 2, unresolvedConflictCount: 0 }),
    );
    await renderGate();

    await fireEvent.press(screen.getByText("Forgot password? Sign out"));
    await fireEvent.press(screen.getByText("Sign out"));
    expect(mockSignOut).toHaveBeenLastCalledWith({ discardUnsyncedChanges: false });

    await fireEvent.press(await screen.findByText("Delete unsynced changes and sign out"));
    expect(mockSignOut).toHaveBeenLastCalledWith({ discardUnsyncedChanges: true });
  });
});
