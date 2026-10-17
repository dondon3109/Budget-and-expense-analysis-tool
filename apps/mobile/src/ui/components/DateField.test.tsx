import { fireEvent, render, screen } from "@testing-library/react-native";

import { localCalendarDate } from "@/features/transactions/transaction-form";
import { DateField } from "./DateField";

describe("DateField", () => {
  it("opens the value's month and picks a day from the calendar", async () => {
    const handleChange = jest.fn();
    await render(<DateField label="Date" value="2026-10-17" onChange={handleChange} />);

    await fireEvent.press(screen.getByRole("button", { name: /^Date, / }));
    expect(screen.getByText(/October 2026/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^Saturday, October 17, 2026/ }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));

    await fireEvent.press(screen.getByRole("button", { name: /October 5, 2026/ }));
    expect(handleChange).toHaveBeenCalledWith("2026-10-05");
  });

  it("moves between months before picking", async () => {
    const handleChange = jest.fn();
    await render(<DateField label="Date" value="2026-01-15" onChange={handleChange} />);

    await fireEvent.press(screen.getByRole("button", { name: /^Date, / }));
    await fireEvent.press(screen.getByLabelText("Previous month"));
    expect(screen.getByText(/December 2025/)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: /December 31, 2025/ }));
    expect(handleChange).toHaveBeenCalledWith("2025-12-31");
  });

  it("falls back to today for a value that is not a date", async () => {
    const handleChange = jest.fn();
    await render(<DateField label="Date" value="next week" onChange={handleChange} />);

    expect(screen.getByText("Pick a date")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Date" }));
    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    expect(handleChange).toHaveBeenCalledWith(localCalendarDate());
  });
});
