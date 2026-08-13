import { parsePersistedTheme } from "./theme-store";

describe("theme preference persistence", () => {
  it("accepts only the versioned allowlisted preference", () => {
    expect(parsePersistedTheme({ state: { preference: "coffee" }, version: 1 })).toBe("coffee");
  });

  it("fails closed to system for unknown or malformed state", () => {
    expect(parsePersistedTheme({ state: { preference: "neon" }, version: 1 })).toBe("system");
    expect(parsePersistedTheme({ state: { preference: "dark", records: [] }, version: 1 })).toBe(
      "system",
    );
  });
});
