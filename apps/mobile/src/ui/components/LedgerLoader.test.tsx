import { render, screen } from "@testing-library/react-native";

import { LedgerLoader } from "./LedgerLoader";

describe("LedgerLoader", () => {
  it("announces itself as a busy progress indicator", async () => {
    await render(<LedgerLoader accessibilityLabel="Restoring your session" />);

    const loader = screen.getByLabelText("Restoring your session");
    expect(loader.props.accessibilityRole).toBe("progressbar");
    expect(loader.props.accessibilityState).toEqual({ busy: true });
  });

  it("draws three ledger rows", async () => {
    await render(<LedgerLoader size="small" />);

    const rows = screen.getByLabelText("Loading").children;
    expect(rows).toHaveLength(3);
  });
});
