import type { WorkspaceSummary } from "@zoption/shared";

import * as SecureStore from "expo-secure-store";

import {
  familyOpenable,
  loadWorkspaceRecord,
  mergeWorkspaceList,
  workspaceSubjects,
} from "./workspace-record";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn() }));
jest.mock("@/db/key-store", () => ({ workspaceAlias: async () => "alias" }));

const family = (id: string, role: WorkspaceSummary["role"] = "member"): WorkspaceSummary => ({
  id,
  kind: "family",
  name: `Family ${id}`,
  role,
});

describe("mergeWorkspaceList", () => {
  it("drops families the person left and falls back to personal when one was shown", () => {
    const { record, gone } = mergeWorkspaceList(
      {
        active: "a",
        families: [family("a"), family("b")],
        synced: ["a", "b"],
        closing: { a: "2026-11-18T00:00:00.000Z", b: "2026-11-20T00:00:00.000Z" },
      },
      [{ id: "user-1", kind: "user", name: "Personal", role: "owner" }, family("b", "viewer")],
    );
    expect(gone).toEqual(["a"]);
    expect(record).toEqual({
      active: null,
      families: [family("b", "viewer")],
      synced: ["b"],
      closing: { b: "2026-11-20T00:00:00.000Z" },
    });
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
    workspaceSubjects("user-1", { active: null, families: [family("a")], synced: [], closing: {} }),
  ).toEqual(["user-1", "user-1#family:a"]);
});

describe("loadWorkspaceRecord", () => {
  it("reads a record saved before closing dates were kept as having none", async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValue(JSON.stringify({ active: "a", families: [family("a")], synced: ["a"] }));
    expect(await loadWorkspaceRecord("user-1")).toEqual({
      active: "a",
      families: [family("a")],
      synced: ["a"],
      closing: {},
    });
  });
});
