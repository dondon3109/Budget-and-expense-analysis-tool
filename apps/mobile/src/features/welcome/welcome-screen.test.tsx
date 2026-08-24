import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import WelcomeScreen from "../../../app/(public)/index";

const mockSignInWithDummyAccount = jest.fn(async () => undefined);
const mockSignInWithPassword = jest.fn(async () => undefined);
let mockDevelopmentVariant = true;

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("@/config/app-variant", () => ({
  isDevelopmentAppVariant: () => mockDevelopmentVariant,
}));

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-out",
    subject: null,
    configured: true,
    signInWithGoogle: jest.fn(async () => undefined),
    signInWithPassword: mockSignInWithPassword,
    signInWithDummyAccount: mockSignInWithDummyAccount,
    sendPasswordReset: jest.fn(async () => undefined),
    exchangeCodeForSession: jest.fn(async () => undefined),
    updatePassword: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  }),
}));

describe("WelcomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevelopmentVariant = true;
  });

  it("renders brand headline, capability badges, and value pillars", async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText("Your money, in your hands.")).toBeTruthy();
    expect(screen.getByText("Offline First")).toBeTruthy();
    expect(screen.getByText("Encrypted SQLite")).toBeTruthy();
    expect(screen.getByText("🇵🇭 PHP Native")).toBeTruthy();

    expect(screen.getByText("Offline-first speed")).toBeTruthy();
    expect(screen.getByText("Smart receipt scanning")).toBeTruthy();
    expect(screen.getByText("Category budgets & trends")).toBeTruthy();
    expect(screen.getByText("Private by design")).toBeTruthy();
  });

  it("renders illustrative preview card with disclaimer", async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText("ILLUSTRATIVE WORKSPACE")).toBeTruthy();
    expect(screen.getByText("Total Net Balance")).toBeTruthy();
    expect(
      screen.getByText("Preview values are synthetic and illustrative."),
    ).toBeTruthy();
  });

  it("navigates to sign-in on primary CTA press", async () => {
    await render(<WelcomeScreen />);

    const signInButton = screen.getByRole("button", { name: "Sign in to Zoption" });
    fireEvent.press(signInButton);

    expect(router.push).toHaveBeenCalledWith("/(public)/sign-in");
  });

  it("allows dummy sign-in in development variant", async () => {
    await render(<WelcomeScreen />);

    const dummyButton = screen.getByRole("button", {
      name: "Sign in with dummy account",
    });
    fireEvent.press(dummyButton);

    expect(mockSignInWithDummyAccount).toHaveBeenCalledTimes(1);
  });

  it("hides dummy sign-in button in non-development variants", async () => {
    mockDevelopmentVariant = false;
    await render(<WelcomeScreen />);

    expect(screen.queryByRole("button", { name: "Sign in with dummy account" })).toBeNull();
  });
});
