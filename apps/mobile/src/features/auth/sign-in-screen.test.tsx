import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import SignInScreen from "../../../app/(public)/sign-in";

const mockSignInWithGoogle = jest.fn(async () => undefined);
const mockSignInWithPassword = jest.fn(async () => undefined);
const mockSignInWithDummyAccount = jest.fn(async () => undefined);
let mockDevelopmentVariant = true;

jest.mock("@/config/app-variant", () => ({
  isDevelopmentAppVariant: () => mockDevelopmentVariant,
}));

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-out",
    subject: null,
    configured: true,
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
