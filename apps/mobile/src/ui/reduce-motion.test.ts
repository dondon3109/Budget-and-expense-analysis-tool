import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useReduceMotionStore } from "@/stores/reduce-motion-store";
import { useReduceMotion } from "./reduce-motion";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe("useReduceMotion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    useReduceMotionStore.setState({ enabled: false });
  });

  it("reduces motion when only the in-app switch is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(false));

    await act(async () => useReduceMotionStore.setState({ enabled: true }));

    expect(result.current).toBe(true);
  });

  it("keeps the system setting when the in-app switch is off", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });
});
