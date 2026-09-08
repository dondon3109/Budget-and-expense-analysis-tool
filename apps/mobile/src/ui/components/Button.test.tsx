import { fireEvent, render, screen } from "@testing-library/react-native";

import { spacing, themes, touchTarget } from "@/ui/tokens";
import { Button } from "./Button";

describe("Button", () => {
  it("exposes an accessible action and invokes it once", async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Save transaction</Button>);

    const button = screen.getByRole("button", { name: "Save transaction" });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("announces a disabled busy state while loading", async () => {
    await render(<Button loading>Save transaction</Button>);
    const button = screen.getByRole("button", { name: "Save transaction" });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({
      backgroundColor: themes.light.colors.surface,
      borderColor: themes.light.colors.border,
    });
  });

  it("renders a large icon action with a production touch target", async () => {
    await render(
      <Button icon="camera-outline" size="large">
        Take receipt photo
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Take receipt photo" })).toHaveStyle({
      minHeight: touchTarget + spacing.sm,
    });
  });

  it("renders a compact button with reduced padding and accessible touch target", async () => {
    await render(
      <Button icon="plus" size="compact">
        Add item
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Add item" });
    expect(button).toHaveStyle({
      minHeight: touchTarget,
      paddingHorizontal: spacing.sm + 2,
    });
  });

  it("renders an icon-only square button when children are omitted", async () => {
    await render(
      <Button
        accessibilityLabel="Share envelopes"
        icon="share-variant-outline"
        variant="secondary"
      />,
    );

    const button = screen.getByRole("button", { name: "Share envelopes" });
    expect(button).toHaveStyle({
      width: touchTarget,
      height: touchTarget,
      paddingHorizontal: 0,
      paddingVertical: 0,
    });
    expect(screen.queryByText("Share envelopes")).toBeNull();
  });
});
