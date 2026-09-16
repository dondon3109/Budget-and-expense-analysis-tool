import { fireEvent, render, screen } from "@testing-library/react-native";
import { Modal, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { SelectionField } from "./SelectionField";

const OPTIONS = [
  { id: "opt-1", label: "Option 1", detail: "Detail 1" },
  { id: "opt-2", label: "Option 2", detail: "Detail 2" },
];

describe("SelectionField", () => {
  it("renders a BottomSheet modal when used at top level", async () => {
    const handleSelect = jest.fn();
    await render(
      <SelectionField
        label="Test Field"
        value=""
        options={OPTIONS}
        placeholder="Select option"
        sheetTitle="Choose Option"
        onSelect={handleSelect}
      />,
    );

    // Initial state: field button is rendered
    expect(screen.getByText("Select option")).toBeTruthy();

    // Open sheet
    await fireEvent.press(screen.getByRole("button", { name: /Test Field/ }));

    // A Modal should be present
    const modals =
      screen.root?.queryAll((node) => node.type === "Modal" || (node.type as unknown) === Modal) ?? [];
    expect(modals.length).toBe(1);
    expect(screen.getByText("Option 1")).toBeTruthy();

    // Select option 1
    await fireEvent.press(screen.getByLabelText("Option 1"));
    expect(handleSelect).toHaveBeenCalledWith("opt-1");
  });

  it("expands inline without creating a nested Modal when inside a BottomSheet", async () => {
    const handleSelect = jest.fn();
    await render(
      <View>
        <BottomSheet visible title="Parent Sheet" onDismiss={jest.fn()}>
          <SelectionField
            label="Nested Field"
            value=""
            options={OPTIONS}
            placeholder="Select nested option"
            sheetTitle="Nested Sheet Title"
            onSelect={handleSelect}
          />
        </BottomSheet>
      </View>,
    );

    const modalsBefore =
      screen.root?.queryAll((node) => node.type === "Modal" || (node.type as unknown) === Modal) ?? [];
    expect(modalsBefore.length).toBe(1);

    // Open nested selection field
    await fireEvent.press(screen.getByRole("button", { name: /Nested Field/ }));

    const modalsAfter =
      screen.root?.queryAll((node) => node.type === "Modal" || (node.type as unknown) === Modal) ?? [];
    expect(modalsAfter.length).toBe(1);

    // Options are rendered inline
    expect(screen.getByText("Option 1")).toBeTruthy();
    expect(screen.getByText("Option 2")).toBeTruthy();

    // Select option 2
    await fireEvent.press(screen.getByLabelText("Option 2"));
    expect(handleSelect).toHaveBeenCalledWith("opt-2");
  });

  it("collapses inline options when the field is pressed again while open", async () => {
    await render(
      <View>
        <BottomSheet visible title="Parent Sheet" onDismiss={jest.fn()}>
          <SelectionField
            label="Toggle Field"
            value=""
            options={OPTIONS}
            placeholder="Select option"
            sheetTitle="Toggle Sheet"
            onSelect={jest.fn()}
          />
        </BottomSheet>
      </View>,
    );

    const button = screen.getByRole("button", { name: /Toggle Field/ });

    // Open
    await fireEvent.press(button);
    expect(screen.getByText("Option 1")).toBeTruthy();

    // Close
    await fireEvent.press(button);
    expect(screen.queryByText("Option 1")).toBeNull();
  });
});
