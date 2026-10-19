import type { WorkspaceSummary } from "@zoption/shared";

import { familyOpenable, mergeWorkspaceList, workspaceSubjects } from "./workspace-record";

const family = (id: string, role: WorkspaceSummary["role"] = "member"): WorkspaceSummary => ({
  id,
  kind: "family",
  name: `Family ${id}`,
  role,
});

describe("mergeWorkspaceList", () => {
  it("drops families the person left and falls back to personal when one was shown", () => {
    const { record, gone } = mergeWorkspaceList(
      { active: "a", families: [family("a"), family("b")], synced: ["a", "b"] },
      [{ id: "user-1", kind: "user", name: "Personal", role: "owner" }, family("b", "viewer")],
    );
    expect(gone).toEqual(["a"]);
    expect(record).toEqual({ active: null, families: [family("b", "viewer")], synced: ["b"] });
  });
});

describe("familyOpenable", () => {
  it("needs a connection only before a family's first sync", () => {
    expect(familyOpenable("a", [], false)).toBe(false);
    expect(familyOpenable("a", [], null)).toBe(true);
    expect(familyOpenable("a", ["a"], false)).toBe(true);
  });
});

it("lists the personal file first, then one per family", () => {
  expect(
    workspaceSubjects("user-1", { active: null, families: [family("a")], synced: [] }),
  ).toEqual(["user-1", "user-1#family:a"]);
});
