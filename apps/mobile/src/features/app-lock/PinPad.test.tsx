import { fireEvent, render, screen } from "@testing-library/react-native";

import { PinPadScreen } from "./PinPad";

describe("PinPadScreen", () => {
  it("builds on earlier taps when the parent has not re-rendered yet", async () => {
    const onChange = jest.fn();
    // `value` stays "" like a render still pending behind a busy JS thread.
    await render(<PinPadScreen title="Locked" message="Enter PIN" value="" onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText("1"));
    await fireEvent.press(screen.getByLabelText("2"));

    expect(onChange).toHaveBeenNthCalledWith(1, "1");
    expect(onChange).toHaveBeenNthCalledWith(2, "12");
  });
});
