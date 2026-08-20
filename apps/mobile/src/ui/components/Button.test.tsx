import { fireEvent, render, screen } from "@testing-library/react-native";

import { themes } from "@/ui/tokens";
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
});
