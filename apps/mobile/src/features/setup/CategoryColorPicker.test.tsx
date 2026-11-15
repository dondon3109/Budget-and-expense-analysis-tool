import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { CategoryColorPicker } from "./CategoryColorPicker";

jest.mock("@/features/sounds/sound-effects", () => ({
  withTapSound:
    <T extends unknown[]>(handler: (...args: T) => void) =>
    (...args: T) =>
      handler(...args),
}));

function Harness({ initial = "#0F766E", open = false }: { initial?: string; open?: boolean }) {
  const [color, setColor] = useState(initial);
  const [customOpen, setCustomOpen] = useState(open);
  return (
    <CategoryColorPicker
      color={color}
      customOpen={customOpen}
      disabled={false}
      onChange={setColor}
      onCustomOpenChange={setCustomOpen}
    />
  );
}

async function drag(label: string, pageX: number) {
  const track = screen.getByTestId(`color-slider-${label}`);
  await fireEvent(track, "layout", { nativeEvent: { layout: { width: 222 } } });
  await fireEvent(track, "responderGrant", { nativeEvent: { pageX, locationX: pageX } });
}

describe("CategoryColorPicker", () => {
  it("names the chosen preset and switches presets", async () => {
    await render(<Harness />);
    expect(screen.getByText("Emerald")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Use Blue for this category"));

    expect(screen.getByText("Blue")).toBeTruthy();
    expect(screen.getByLabelText("Use Blue for this category").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it("slides to a custom color and shows its hex code", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByText("Pick a custom color"));

    // Thumb is 22 wide on a 222 track, so x = 11 is the left end and 211 the right.
    await drag("Hue", 11);
    await drag("Vividness", 211);
    await drag("Brightness", 211);

    expect(screen.getByText("Custom #FF0000")).toBeTruthy();
    expect(screen.getByLabelText("Hex code").props.value).toBe("#FF0000");
  });

  it("keeps the sliders in step with a typed hex code", async () => {
    await render(<Harness open />);
    await fireEvent.changeText(screen.getByLabelText("Hex code"), "#0000ff");

    expect(screen.getByLabelText("Hue").props.accessibilityValue).toEqual(
      expect.objectContaining({ now: 67 }),
    );
    expect(screen.getByText("Custom #0000FF")).toBeTruthy();
  });

  it("steps a slider from a screen reader", async () => {
    await render(<Harness initial="#808080" open />);
    await fireEvent(screen.getByLabelText("Brightness"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });

    expect(screen.getByLabelText("Brightness").props.accessibilityValue).toEqual(
      expect.objectContaining({ now: 55 }),
    );
  });
});
