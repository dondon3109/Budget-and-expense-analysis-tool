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

    const refreshControls = screen.root?.queryAll((node) => node.type === "RCTRefreshControl") ?? [];
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
});
