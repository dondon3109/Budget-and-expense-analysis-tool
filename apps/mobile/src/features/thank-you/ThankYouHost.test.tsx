import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { showThankYou, ThankYouHost } from "./ThankYouHost";

describe("ThankYouHost", () => {
  it("shows a different message for each finished task and closes", async () => {
    await render(<ThankYouHost />);
    expect(screen.queryByText("Continue")).toBeNull();

    await act(async () => showThankYou("goal"));
    expect(screen.getByText("Thank you!")).toBeTruthy();
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.queryByText("Continue")).toBeNull();

    await act(async () => showThankYou("pro"));
    expect(screen.getByText("Thank you for upgrading Zoption!")).toBeTruthy();
  });
});
