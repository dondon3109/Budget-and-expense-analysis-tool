import { assertSignOutRiskAllowed, UnsyncedChangesError } from "./sign-out-policy";

describe("mobile sign-out policy", () => {
  it("allows cleanup when no durable local work is at risk", () => {
    expect(() =>
      assertSignOutRiskAllowed(
        { unsyncedOperationCount: 0, unresolvedConflictCount: 0 },
        false,
      ),
    ).not.toThrow();
  });

  it("requires an explicit discard decision for unsynchronized work", () => {
    expect(() =>
      assertSignOutRiskAllowed(
        { unsyncedOperationCount: 2, unresolvedConflictCount: 1 },
        false,
      ),
    ).toThrow(UnsyncedChangesError);
  });

  it("permits deliberate discard after the warning is accepted", () => {
    expect(() =>
      assertSignOutRiskAllowed(
        { unsyncedOperationCount: 2, unresolvedConflictCount: 1 },
        true,
      ),
    ).not.toThrow();
  });
});
