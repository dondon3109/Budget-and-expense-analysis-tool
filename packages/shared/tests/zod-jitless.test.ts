import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("zod jitless entry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    z.config({ jitless: false });
  });

  it("builds and parses object schemas without probing new Function", async () => {
    // A strict CSP makes `new Function(...)` throw exactly this; Zod calls it as a constructor.
    const evalProbe = vi.fn(function blockedFunction() {
      throw new EvalError("Code generation from strings disallowed for this context");
    });
    vi.stubGlobal("Function", evalProbe);

    await import("../src/zodJitless");

    expect(z.config().jitless).toBe(true);
    const schema = z.object({ amountMinor: z.number().int() }).strict();
    expect(schema.parse({ amountMinor: 1250 })).toEqual({ amountMinor: 1250 });
    expect(evalProbe).not.toHaveBeenCalled();
  });
});
