import { fireEvent, render, screen } from "@testing-library/react-native";

import { SyncPausedBanner } from "./SyncPausedBanner";

describe("SyncPausedBanner", () => {
  it("explains that local changes are safe and offers an immediate retry", async () => {
    const onRetry = jest.fn();

    await render(
      <SyncPausedBanner
        message="Zoption could not reach the synchronization service."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Sync delayed")).toBeTruthy();
    expect(screen.getByText(/changes are safe on this device/i)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides the notice when dismissed and shows it again for a different message", async () => {
    const view = await render(<SyncPausedBanner message="First failure." onRetry={jest.fn()} />);

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss sync delayed notice" }));
    expect(screen.queryByText("Sync delayed")).toBeNull();

    await view.rerender(<SyncPausedBanner message="Second failure." onRetry={jest.fn()} />);
    expect(screen.getByText("Sync delayed")).toBeTruthy();
  });
});
