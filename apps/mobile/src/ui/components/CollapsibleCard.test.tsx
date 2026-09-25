import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { CollapsibleCard } from "./CollapsibleCard";

describe("CollapsibleCard", () => {
  it("starts folded with the current value and toggles its content", async () => {
    await render(
      <CollapsibleCard title="Theme" summary="Dark" icon="palette-outline">
        <Text>Theme options</Text>
      </CollapsibleCard>,
    );

    const header = screen.getByRole("button", { name: "Theme, Dark" });
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText("Theme options")).toBeNull();

    await fireEvent.press(header);
    expect(screen.getByText("Theme options")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Theme, Dark" }).props.accessibilityState,
    ).toMatchObject({ expanded: true });

    await fireEvent.press(screen.getByRole("button", { name: "Theme, Dark" }));
    expect(screen.queryByText("Theme options")).toBeNull();
  });
});
