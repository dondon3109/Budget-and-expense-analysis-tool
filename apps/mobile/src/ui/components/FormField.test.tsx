import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { FormField } from "./FormField";

describe("FormField", () => {
  it("renders label, placeholder, and handles focus/blur", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();

    await render(
      <FormField
        label="Description"
        placeholder="Enter description"
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    expect(screen.getByText("Description")).toBeTruthy();
    const input = screen.getByPlaceholderText("Enter description");
    expect(input).toBeTruthy();

    await fireEvent(input, "focus");
    expect(onFocus).toHaveBeenCalledTimes(1);

    await fireEvent(input, "blur");
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("renders error message with alert accessibility role", async () => {
    await render(
      <FormField label="Amount" error="Amount must be greater than zero" />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Amount must be greater than zero")).toBeTruthy();
  });

  it("renders hint message when provided without error", async () => {
    await render(<FormField label="Notes" hint="Optional details" />);

    expect(screen.getByText("Optional details")).toBeTruthy();
  });

  it("applies textAlignVertical: 'top' when multiline is true", async () => {
    await render(
      <FormField label="Message" multiline placeholder="Enter message" />,
    );

    const input = screen.getByPlaceholderText("Enter message");
    const flatStyle = Array.isArray(input.props.style)
      ? Object.assign({}, ...input.props.style)
      : input.props.style;

    expect(flatStyle.textAlignVertical).toBe("top");
  });

  it("applies textAlignVertical: 'center' when multiline is false", async () => {
    await render(<FormField label="Title" placeholder="Enter title" />);

    const input = screen.getByPlaceholderText("Enter title");
    const flatStyle = Array.isArray(input.props.style)
      ? Object.assign({}, ...input.props.style)
      : input.props.style;

    expect(flatStyle.textAlignVertical).toBe("center");
  });

  it("renders trailing content when provided", async () => {
    await render(
      <FormField
        label="Currency"
        trailing={<Text testID="trailing-icon">PHP</Text>}
      />,
    );

    expect(screen.getByTestId("trailing-icon")).toBeTruthy();
  });

  describe("formatDateInput", () => {
    it("auto-hyphenates 8-digit strings into YYYY-MM-DD", () => {
      const { formatDateInput } = require("./FormField");
      expect(formatDateInput("20260916")).toBe("2026-09-16");
      expect(formatDateInput("20261231")).toBe("2026-12-31");
    });

    it("converts slash format YYYY/MM/DD into YYYY-MM-DD", () => {
      const { formatDateInput } = require("./FormField");
      expect(formatDateInput("2026/09/16")).toBe("2026-09-16");
    });

    it("leaves already formatted dates and partial inputs intact", () => {
      const { formatDateInput } = require("./FormField");
      expect(formatDateInput("2026-09-16")).toBe("2026-09-16");
      expect(formatDateInput("2026-09")).toBe("2026-09");
      expect(formatDateInput("2026")).toBe("2026");
    });
  });
});
