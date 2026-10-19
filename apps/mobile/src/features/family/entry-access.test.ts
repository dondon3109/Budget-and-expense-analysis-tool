import { canChangeEntry } from "./entry-access";

const synced = (authorUserId: string | null) => ({ authorUserId, syncState: "synced" as const });

describe("canChangeEntry", () => {
  it("lets a member change only the entries they added", () => {
    const member = { role: "member" as const };
    expect(canChangeEntry(member, "me", synced("me"))).toBe(true);
    expect(canChangeEntry(member, "me", synced("them"))).toBe(false);
    expect(canChangeEntry(member, "me", synced(null))).toBe(false);
    expect(canChangeEntry(member, "me", { authorUserId: null, syncState: "pending" })).toBe(true);
    expect(canChangeEntry(member, "me", null)).toBe(true);
  });

  it("keeps viewers read only and lets the owner change anything", () => {
    expect(canChangeEntry({ role: "viewer" }, "me", null)).toBe(false);
    expect(canChangeEntry({ role: "owner" }, "me", synced("them"))).toBe(true);
    expect(canChangeEntry(null, "me", synced("them"))).toBe(true);
  });
});
