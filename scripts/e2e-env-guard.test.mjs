import { describe, expect, it } from "vitest";

import { e2eEnvGuardError } from "../e2e/env-guard.ts";

const SEEDED = {
  E2E_EMAIL: "audit@example.com",
  E2E_PASSWORD: "Audit-Pass-1234!",
};

const EMPTY = {
  E2E_EMPTY_EMAIL: "empty@example.com",
  E2E_EMPTY_PASSWORD: "Empty-Pass-1234!",
};

describe("e2eEnvGuardError", () => {
  it("stays silent when no .env.e2e was loaded, which is CI's case", () => {
    expect(e2eEnvGuardError(false, {})).toBeNull();
    expect(e2eEnvGuardError(false, { E2E_EMAIL: "audit@example.com" })).toBeNull();
  });

  it("accepts a loaded file that set both required credentials", () => {
    expect(e2eEnvGuardError(true, { ...SEEDED })).toBeNull();
  });

  it("refuses a loaded file that leaves a required credential unset, naming it", () => {
    expect(e2eEnvGuardError(true, { E2E_EMAIL: SEEDED.E2E_EMAIL })).toContain("E2E_PASSWORD");
    expect(e2eEnvGuardError(true, { E2E_PASSWORD: SEEDED.E2E_PASSWORD })).toContain("E2E_EMAIL");
    const bothMissing = e2eEnvGuardError(true, {});
    expect(bothMissing).toContain("E2E_EMAIL and E2E_PASSWORD");
  });

  it("reads a quoted blank email as unset, exactly as the fixtures do", () => {
    expect(e2eEnvGuardError(true, { ...SEEDED, E2E_EMAIL: "   " })).toContain("E2E_EMAIL");
    expect(e2eEnvGuardError(true, { ...SEEDED, ...EMPTY, E2E_EMPTY_EMAIL: "\t" })).toContain(
      "E2E_EMPTY_EMAIL",
    );
  });

  it("keeps a password's edge whitespace meaningful, exactly as the fixtures do", () => {
    expect(e2eEnvGuardError(true, { ...SEEDED, E2E_PASSWORD: "   " })).toBeNull();
  });

  it("refuses a lone empty-workspace credential but accepts the complete optional pair", () => {
    expect(e2eEnvGuardError(true, { ...SEEDED, ...EMPTY })).toBeNull();
    expect(e2eEnvGuardError(true, { ...SEEDED, E2E_EMPTY_EMAIL: EMPTY.E2E_EMPTY_EMAIL })).toContain(
      "E2E_EMPTY_PASSWORD",
    );
    expect(
      e2eEnvGuardError(true, { ...SEEDED, E2E_EMPTY_PASSWORD: EMPTY.E2E_EMPTY_PASSWORD }),
    ).toContain("E2E_EMPTY_EMAIL");
  });
});
