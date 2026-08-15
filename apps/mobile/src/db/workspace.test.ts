import { describeWorkspaceOpenFailure } from "./workspace";

describe("workspace open failure classification", () => {
  it("gives recovery guidance for corrupted database files", () => {
    expect(
      describeWorkspaceOpenFailure(new Error("SQLITE_CORRUPT: database disk image is malformed")),
    ).toMatch(/damaged/);
    expect(describeWorkspaceOpenFailure(new Error("file is not a database"))).toMatch(/damaged/);
    expect(describeWorkspaceOpenFailure(new Error("SQLITE_NOTADB"))).toMatch(/damaged/);
  });

  it("never surfaces raw native error text", () => {
    const message = describeWorkspaceOpenFailure(
      new Error("secret key material /path/to/sensitive/file.db"),
    );
    expect(message).toBe("The encrypted local workspace could not be opened on this device.");
  });

  it("handles non-Error failures", () => {
    expect(describeWorkspaceOpenFailure("boom")).toBe(
      "The encrypted local workspace could not be opened on this device.",
    );
    expect(describeWorkspaceOpenFailure(undefined)).toBe(
      "The encrypted local workspace could not be opened on this device.",
    );
  });
});
