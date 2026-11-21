import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { router } from "expo-router";

import { SignInScreen } from "./SignInScreen";

const mockSignInWithGoogle = jest.fn(async () => undefined);
const mockSignInWithPassword = jest.fn(async () => undefined);
const mockSignInWithDummyAccount = jest.fn(async () => undefined);
const mockContinueAsGuest = jest.fn(async () => undefined);
let mockDevelopmentVariant = true;
let mockStatus = "signed-out";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@/config/app-variant", () => ({
  isDevelopmentAppVariant: () => mockDevelopmentVariant,
}));

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: mockStatus,
    subject: null,
    configured: true,
    continueAsGuest: mockContinueAsGuest,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithPassword: mockSignInWithPassword,
    signInWithDummyAccount: mockSignInWithDummyAccount,
    sendPasswordReset: jest.fn(async () => undefined),
    exchangeCodeForSession: jest.fn(async () => undefined),
    updatePassword: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  }),
}));

describe("sign-in screen social options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevelopmentVariant = true;
    mockStatus = "signed-out";
  });

  it("lets a signed-out user continue without an account and warns about guest data transfer", async () => {
    await render(<SignInScreen />);
    expect(screen.getByText(/will not transfer if you sign in later/)).toBeTruthy();
    expect(screen.getByText(/An account adds backup and sync/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue without an account" }));
    expect(mockContinueAsGuest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/(app)/(tabs)"));
  });

  it("opens the account creation screen from Create an account", async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Create an account" }));
    expect(router.push).toHaveBeenCalledWith("/(public)/sign-up");
  });

  it("offers Not now instead of guest mode to an existing guest", async () => {
    mockStatus = "guest";
    await render(<SignInScreen />);
    expect(screen.queryByRole("button", { name: "Continue without an account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
  });

  it("exposes a working dummy account sign-in action", async () => {
    await render(<SignInScreen />);
    const button = screen.getByRole("button", { name: "Sign in with dummy account" });
    expect(button).not.toBeDisabled();
    await fireEvent.press(button);
    expect(mockSignInWithDummyAccount).toHaveBeenCalledTimes(1);
  });

  it("does not expose dummy account sign-in outside Zoption Dev", async () => {
    mockDevelopmentVariant = false;
    await render(<SignInScreen />);
    expect(screen.queryByRole("button", { name: "Sign in with dummy account" })).toBeNull();
  });

  it("exposes a working Continue with Google action", async () => {
    await render(<SignInScreen />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button).not.toBeDisabled();
    await fireEvent.press(button);
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("surfaces a Google start failure without crashing", async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error("provider unreachable"));
    await render(<SignInScreen />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    await fireEvent.press(button);
    expect(await screen.findByText("provider unreachable")).toBeTruthy();
  });

  it("re-enables the Google button after the browser session resolves", async () => {
    let resolveGoogle: (value: undefined) => void = () => undefined;
    mockSignInWithGoogle.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveGoogle = resolve;
        }),
    );
    await render(<SignInScreen />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    await fireEvent.press(button);
    expect(button).toBeDisabled();
    resolveGoogle(undefined);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.queryByText(/Google sign-in/)).toBeNull();
  });
});
