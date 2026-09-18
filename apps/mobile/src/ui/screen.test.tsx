import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Screen } from "./screen";

describe("Screen", () => {
  it("renders title, description and children", async () => {
    await render(
      <Screen title="Test Title" description="Test Description">
        <Text>Hello Content</Text>
      </Screen>,
    );

    expect(screen.getByRole("header", { name: "Test Title" })).toBeTruthy();
    expect(screen.getByText("Test Description")).toBeTruthy();
    expect(screen.getByText("Hello Content")).toBeTruthy();
  });

  it("does not render RefreshControl when onRefresh is omitted", async () => {
    await render(
      <Screen title="No Refresh">
        <Text>Content</Text>
      </Screen>,
    );

    const refreshControls =
      screen.root?.queryAll((node) => node.type === "RCTRefreshControl") ?? [];
    expect(refreshControls).toHaveLength(0);
  });

  it("mounts RefreshControl and triggers onRefresh callback when provided", async () => {
    const handleRefresh = jest.fn().mockResolvedValue(undefined);

    await render(
      <Screen onRefresh={handleRefresh} title="Pullable">
        <Text>Content</Text>
      </Screen>,
    );

    const refreshControl = screen.root?.queryAll((node) => node.type === "RCTRefreshControl")[0];
    expect(refreshControl).toBeTruthy();
    if (!refreshControl) throw new Error("RCTRefreshControl not found");

    await act(async () => {
      await fireEvent(refreshControl, "refresh");
    });

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it("reflects refreshing state from props", async () => {
    await render(
      <Screen onRefresh={jest.fn()} refreshing title="Refreshing Screen">
        <Text>Content</Text>
      </Screen>,
    );

    const scrollView = screen.root?.queryAll((node) => node.type === "RCTScrollView")[0];
    expect(scrollView).toBeTruthy();
    if (!scrollView) throw new Error("RCTScrollView not found");
    expect(scrollView.props.refreshControl.props.refreshing).toBe(true);
  });

  it("renders non-scrollable view when scroll is false", async () => {
    await render(
      <Screen scroll={false} title="Fixed Screen">
        <Text>Non-scrollable content</Text>
      </Screen>,
    );

    const scrollViews = screen.root?.queryAll((node) => node.type === "RCTScrollView") ?? [];
    expect(scrollViews).toHaveLength(0);
    expect(screen.getByText("Non-scrollable content")).toBeTruthy();
  });

  it("suppresses title display when hasHeader is true but retains description and action", async () => {
    await render(
      <Screen
        action={<Text>Action Btn</Text>}
        description="Pushed Screen Description"
        hasHeader
        title="Pushed Title"
      >
        <Text>Screen Body</Text>
      </Screen>,
    );

    // Title header should not be displayed because native stack header handles it
    expect(screen.queryByRole("header", { name: "Pushed Title" })).toBeNull();
    // Description, action and content should still be rendered
    expect(screen.getByText("Pushed Screen Description")).toBeTruthy();
    expect(screen.getByText("Action Btn")).toBeTruthy();
    expect(screen.getByText("Screen Body")).toBeTruthy();
  });

  it("renders overlay outside scroll view when provided", async () => {
    await render(
      <Screen overlay={<Text testID="pinned-fab">FAB</Text>} title="Screen with Overlay">
        <Text>Content</Text>
      </Screen>,
    );

    expect(screen.getByTestId("pinned-fab")).toBeTruthy();
  });

  it("renders leadingAction on the leading side of the heading", async () => {
    await render(
      <Screen leadingAction={<Text testID="back-btn">Back</Text>} title="Screen with Back">
        <Text>Content</Text>
      </Screen>,
    );

    expect(screen.getByTestId("back-btn")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Screen with Back" })).toBeTruthy();
  });
});
