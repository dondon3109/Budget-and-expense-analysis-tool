import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { SignUpScreen } from "./SignUpScreen";

const mockSignUpWithPassword = jest.fn();
const mockSignInWithGoogle = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { capture: jest.fn(async () => undefined) },
}));

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-out",
    subject: null,
    configured: true,
    signUpWithPassword: mockSignUpWithPassword,
    signInWithGoogle: mockSignInWithGoogle,
  }),
}));

describe("SignUpScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignUpWithPassword.mockResolvedValue({ confirmationRequired: false });
  });

  it("validates email, password policy, and confirmation before calling Supabase", async () => {
    await render(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
    await fireEvent.changeText(screen.getByLabelText("Password"), "short");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "mismatch");
    await fireEvent.press(screen.getByRole("button", { name: "Create Zoption account" }));

    expect(mockSignUpWithPassword).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Passwords do not match.")).toBeTruthy();
  });

  it("shows confirmation instructions when email verification is required", async () => {
    mockSignUpWithPassword.mockResolvedValueOnce({ confirmationRequired: true });
    await render(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "  user@example.com  ");
    await fireEvent.changeText(screen.getByLabelText("Password"), "Budgeting-2026!");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "Budgeting-2026!");
    await fireEvent.press(screen.getByRole("button", { name: "Create Zoption account" }));

    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(mockSignUpWithPassword).toHaveBeenCalledWith("user@example.com", "Budgeting-2026!");
  });

  it("enters the app directly when sign-up returns a live session", async () => {
    await render(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "user@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "Budgeting-2026!");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "Budgeting-2026!");
    await fireEvent.press(screen.getByRole("button", { name: "Create Zoption account" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/(app)/(tabs)"));
  });
});
