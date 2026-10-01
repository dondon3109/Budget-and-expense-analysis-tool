import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { WelcomeScreen } from "./WelcomeScreen";

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

  it("renders the brand headline and tagline", async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByRole("header")).toHaveTextContent("Your money, in your hands.");
    expect(screen.getByText("Private, offline-first budgeting built for the peso.")).toBeTruthy();
  });

  it("navigates to sign-in on primary CTA press", async () => {
    await render(<WelcomeScreen />);

    const signInButton = screen.getByRole("button", { name: "Sign in to Zoption" });
    await fireEvent.press(signInButton);

    expect(router.push).toHaveBeenCalledWith("/(public)/sign-in");
  });

  it("allows dummy sign-in in development variant", async () => {
    await render(<WelcomeScreen />);

    const dummyButton = screen.getByRole("button", {
      name: "Sign in with dummy account",
    });
    await fireEvent.press(dummyButton);

    expect(mockSignInWithDummyAccount).toHaveBeenCalledTimes(1);
  });

  it("hides dummy sign-in button in non-development variants", async () => {
    mockDevelopmentVariant = false;
    await render(<WelcomeScreen />);

    expect(screen.queryByRole("button", { name: "Sign in with dummy account" })).toBeNull();
  });
});
