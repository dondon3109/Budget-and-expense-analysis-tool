import { describe, expect, it } from "vitest";

import { createImportFingerprint } from "../src/fingerprint";

describe("import fingerprint", () => {
  it("is stable across casing and extra whitespace", async () => {
    const first = await createImportFingerprint({
      date: "2026-07-01",
      amountMinor: -12500,
      description: "  Corner   Cafe ",
      accountSource: "Main Account",
    });
    const second = await createImportFingerprint({
      date: "2026-07-01",
      amountMinor: -12500,
      description: "corner cafe",
      accountSource: "main account",
    });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});
