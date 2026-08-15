import { fireEvent, render, screen } from "@testing-library/react-native";

import SignInScreen from "../../../app/(public)/sign-in";

const mockSignInWithGoogle = jest.fn(async () => undefined);
const mockSignInWithPassword = jest.fn(async () => undefined);

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-out",
    subject: null,
    configured: true,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithPassword: mockSignInWithPassword,
    sendPasswordReset: jest.fn(async () => undefined),
    exchangeCodeForSession: jest.fn(async () => undefined),
    updatePassword: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  }),
}));

describe("sign-in screen social options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
