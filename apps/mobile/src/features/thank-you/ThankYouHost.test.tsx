import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { isNewAccount, showThankYou, ThankYouHost } from "./ThankYouHost";

describe("ThankYouHost", () => {
  it("shows a different message for each finished task and closes", async () => {
    await render(<ThankYouHost />);
    expect(screen.queryByText("Continue")).toBeNull();

    await act(async () => showThankYou("signup"));
    expect(screen.getByText("Thank you for creating your account")).toBeTruthy();
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.queryByText("Continue")).toBeNull();

    await act(async () => showThankYou("pro"));
    expect(screen.getByText("Thank you for upgrading to Zoption Pro!")).toBeTruthy();
  });
});

describe("isNewAccount", () => {
  it("is true only when the first sign-in created the user", () => {
    const created_at = "2026-10-03T10:00:00.000Z";
    expect(isNewAccount({ created_at, last_sign_in_at: "2026-10-03T10:00:02.000Z" })).toBe(true);
    expect(isNewAccount({ created_at, last_sign_in_at: "2026-10-05T10:00:00.000Z" })).toBe(false);
    expect(isNewAccount({ created_at })).toBe(false);
  });
});
