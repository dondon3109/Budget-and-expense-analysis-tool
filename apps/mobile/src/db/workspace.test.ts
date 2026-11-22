import { describeWorkspaceOpenFailure, resolveWorkspaceHasSynced } from "./workspace";

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

describe("resolveWorkspaceHasSynced", () => {
  const fresh = {
    localOnly: false,
    generation: 1,
    serverCursor: null,
    serverAcknowledgedCursor: null,
    outboxCount: 0,
  };

  it("returns false for a fresh file and for one killed mid-initial-pull", () => {
    expect(resolveWorkspaceHasSynced(fresh)).toBe(false);
    expect(resolveWorkspaceHasSynced({ ...fresh, serverCursor: "v1.5k" })).toBe(false);
  });

  it("returns true once acknowledged, rebuilt from a snapshot, local-only, or holding outbox rows", () => {
    expect(resolveWorkspaceHasSynced({ ...fresh, serverAcknowledgedCursor: "v1.5k" })).toBe(true);
    expect(resolveWorkspaceHasSynced({ ...fresh, generation: 2, serverCursor: "v1.5k" })).toBe(
      true,
    );
    expect(resolveWorkspaceHasSynced({ ...fresh, localOnly: true })).toBe(true);
    expect(resolveWorkspaceHasSynced({ ...fresh, outboxCount: 1 })).toBe(true);
  });
});
