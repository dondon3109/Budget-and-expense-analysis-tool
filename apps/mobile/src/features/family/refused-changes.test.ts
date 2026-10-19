import { describeRefusedChanges } from "./refused-changes";

describe("describeRefusedChanges", () => {
  it("names each kind of change a viewer lost", () => {
    expect(
      describeRefusedChanges("workspace_read_only", "Santos family", {
        transaction: 2,
        remittance: 1,
      }),
    ).toEqual({
      title: "You can now only view Santos family",
      message:
        "This phone now shows what the family has. These changes were not saved: 2 entries, 1 remittance.",
    });
  });

  it("says a removed member's copy is gone even with nothing pending", () => {
    expect(describeRefusedChanges("workspace_forbidden", "Santos family", {}).message).toBe(
      "Its copy on this phone was removed.",
    );
  });
});
