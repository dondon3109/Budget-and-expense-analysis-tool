import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { LedgerLoader } from "./LedgerLoader";

/** The fill inside each of the three rows. */
function fills() {
  return screen
    .getByLabelText("Loading")
    .children.map((row) => (typeof row === "string" ? null : row.children[0]))
    .map((fill) =>
      fill && typeof fill !== "string" ? StyleSheet.flatten(fill.props.style) : null,
    );
}

describe("LedgerLoader", () => {
  afterEach(() => jest.restoreAllMocks());

  it("announces itself as a busy progress indicator", async () => {
    await render(<LedgerLoader accessibilityLabel="Restoring your session" />);

    const loader = screen.getByLabelText("Restoring your session");
    expect(loader.props.accessibilityRole).toBe("progressbar");
    expect(loader.props.accessibilityState).toEqual({ busy: true });
  });

  it("draws three ledger rows", async () => {
    await render(<LedgerLoader size="small" />);

    expect(screen.getByLabelText("Loading").children).toHaveLength(3);
  });

  it("rests every row filled when reduced motion is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(<LedgerLoader />);

    expect(fills()).toHaveLength(3);
    await waitFor(() => {
      for (const fill of fills()) expect(fill?.transform).toEqual([]);
    });
  });

  it("offsets the fills to sweep when reduced motion is off", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    await render(<LedgerLoader />);

    await waitFor(() => {
      for (const fill of fills()) expect(fill?.transform).toHaveLength(1);
    });
  });
});
