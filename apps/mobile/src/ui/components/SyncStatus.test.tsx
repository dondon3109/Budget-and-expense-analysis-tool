import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import { SyncStatus } from "./SyncStatus";

describe("SyncStatus", () => {
  it("shows why a failed sync stopped and offers a retry", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const onRetry = jest.fn();
    await render(
      <SyncStatus state="failed" detail="Zoption could not reach the server." onRetry={onRetry} />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Sync failed" }));
    expect(alert).toHaveBeenCalledWith("Sync failed", "Zoption could not reach the server.", [
      { text: "Close" },
      { text: "Try again", onPress: onRetry },
    ]);
    alert.mockRestore();
  });

  it("is not tappable without a reason or outside a failure", async () => {
    await render(<SyncStatus state="synced" detail="ignored" />);
    expect(screen.queryByRole("button")).toBeNull();
    await render(<SyncStatus state="failed" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
