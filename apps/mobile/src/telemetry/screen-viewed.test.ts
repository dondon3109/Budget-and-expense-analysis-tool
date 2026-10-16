import { screenForPath } from "./screen-viewed";

describe("screenForPath", () => {
  it("names signed-in routes and skips conflict and unknown screens", () => {
    expect(screenForPath("/")).toBe("home");
    expect(screenForPath("/receipt-scan/")).toBe("receipt_scan");
    expect(screenForPath("/transaction")).toBe("transaction_editor");
    expect(screenForPath("/transaction-conflict")).toBeUndefined();
    expect(screenForPath("/sign-in")).toBeUndefined();
  });
});
