import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { PlanLimitHost, reportPlanLimit } from "./PlanLimitDialog";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

describe("PlanLimitHost", () => {
  beforeEach(() => mockPush.mockClear());

  it("opens for a reported limit and routes to billing", async () => {
    await render(<PlanLimitHost />);
    expect(screen.queryByText("Plan limit reached")).toBeNull();

    await act(async () => reportPlanLimit("You have reached your custom category limit."));
    expect(screen.getByText("You have reached your custom category limit.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Review Plan and billing"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/plan-billing");
    expect(screen.queryByText("Plan limit reached")).toBeNull();
  });

  it("closes without navigating", async () => {
    await render(<PlanLimitHost />);
    await act(async () => reportPlanLimit("Limit"));
    await fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Plan limit reached")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
