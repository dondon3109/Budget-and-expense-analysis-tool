import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NewCategoryInline } from "./NewCategoryInline";

describe("NewCategoryInline", () => {
  it("creates the category for the current kind and hands back its id", async () => {
    const createCategory = jest.fn(async () => "category-pet-care");
    const onCreated = jest.fn();

    await render(
      <NewCategoryInline
        kind="expense"
        categoryCount={3}
        createCategory={createCategory}
        onCreated={onCreated}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText("New category name"), "Pet care");
    await fireEvent.changeText(screen.getByLabelText("Emoji icon (optional)"), "🐶");
    await fireEvent.press(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("category-pet-care"));
    expect(createCategory).toHaveBeenCalledWith({
      name: "Pet care",
      kind: "expense",
      color: expect.stringMatching(/^#[0-9A-F]{6}$/),
      iconEmoji: "🐶",
    });
  });

  it("asks for a name instead of writing an empty category", async () => {
    const createCategory = jest.fn(async () => "unused");

    await render(
      <NewCategoryInline
        kind="income"
        categoryCount={0}
        createCategory={createCategory}
        onCreated={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByText("Enter a category name.")).toBeTruthy();
    expect(createCategory).not.toHaveBeenCalled();
  });
});
