import { describe, expect, it } from "vitest";

import { categoryInputSchema, categoryUpdateSchema } from "../src/schemas";

describe("category emoji schemas", () => {
  it.each(["🍔", "👩🏽‍💻", "🇵🇭", "1️⃣"])("accepts one emoji cluster: %s", (iconEmoji) => {
    expect(
      categoryInputSchema.safeParse({
        name: "Custom",
        kind: "expense",
        color: "#123456",
        iconEmoji,
      }).success,
    ).toBe(true);
  });

  it.each(["food", "🍔🍟", "🍔 food"])("rejects a non-icon emoji value: %s", (iconEmoji) => {
    expect(categoryUpdateSchema.safeParse({ iconEmoji }).success).toBe(false);
  });

  it("allows an icon to be cleared", () => {
    expect(categoryUpdateSchema.safeParse({ iconEmoji: null }).success).toBe(true);
  });
});
