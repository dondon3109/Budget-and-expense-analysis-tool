import { markStartupPhase, resetStartupTiming, startupPhases } from "./startup-timing";

describe("startup phase timing", () => {
  beforeEach(() => resetStartupTiming());

  it("records phases in order with offsets measured from the first mark", () => {
    markStartupPhase("bundle");
    markStartupPhase("session:resolved");

    const phases = startupPhases();
    expect(phases.map((phase) => phase.phase)).toEqual(["bundle", "session:resolved"]);
    expect(phases[0]?.atMs).toBeGreaterThanOrEqual(0);
    expect(phases[0]?.deltaMs).toBeGreaterThanOrEqual(0);
    expect(phases[1]?.atMs).toBeGreaterThanOrEqual(phases[0]?.atMs ?? 0);
  });

  it("ignores a repeated phase so a refresh loop cannot log the same step twice", () => {
    markStartupPhase("session:resolved");
    markStartupPhase("session:resolved");

    expect(startupPhases()).toHaveLength(1);
  });
});
