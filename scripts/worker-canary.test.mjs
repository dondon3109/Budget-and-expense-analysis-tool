import { describe, expect, it } from "vitest";

import {
  atomicSettings,
  judgeSoak,
  numberFromEnv,
  overrideHeader,
  servingVersion,
} from "./worker-canary.mjs";

const row = (scriptVersion, requests, errors) => ({
  dimensions: { scriptVersion },
  sum: { requests, errors },
});

describe("worker canary", () => {
  it("rolls out gradually only when no migration or consumer setting changed", () => {
    const config = {
      migrations: [{ tag: "v1" }],
      env: { production: { vars: { A: "1" }, queues: { consumers: [{ queue: "jobs" }] } } },
    };
    const varsOnly = JSON.parse(JSON.stringify(config));
    varsOnly.env.production.vars.A = "2";
    expect(atomicSettings(varsOnly)).toBe(atomicSettings(config));

    const migrated = JSON.parse(JSON.stringify(config));
    migrated.migrations.push({ tag: "v2" });
    expect(atomicSettings(migrated)).not.toBe(atomicSettings(config));

    const consumers = JSON.parse(JSON.stringify(config));
    consumers.env.production.queues.consumers[0].max_retries = 3;
    expect(atomicSettings(consumers)).not.toBe(atomicSettings(config));
  });

  it("refuses to start while production is already split", () => {
    expect(servingVersion({ versions: [{ version_id: "a", percentage: 100 }] })).toBe("a");
    expect(() =>
      servingVersion({
        versions: [
          { version_id: "a", percentage: 90 },
          { version_id: "b", percentage: 10 },
        ],
      }),
    ).toThrow("split across 2 versions");
  });

  it("pins probes to one version with a structured-header string", () => {
    expect(overrideHeader("api", "b")).toEqual({
      "Cloudflare-Workers-Version-Overrides": 'api="b"',
    });
  });

  it("fails the soak only when the new version errors measurably more than the old one", () => {
    expect(judgeSoak([row("old", 500, 1), row("new", 100, 0)], "new").ok).toBe(true);
    expect(judgeSoak([row("old", 500, 1), row("new", 100, 5)], "new")).toMatchObject({
      ok: false,
      lowSample: false,
      summary: expect.stringContaining("errors more than 1 point(s) above the old one"),
    });
  });

  it("promotes on the probes alone below the minimum sample, and says so", () => {
    // A handful of requests says nothing about a rate.
    expect(judgeSoak([row("old", 500, 0), row("new", 49, 49)], "new")).toMatchObject({
      ok: true,
      lowSample: true,
      summary: expect.stringContaining("fewer than 50 requests"),
    });
    // At the minimum the rate is judged.
    expect(judgeSoak([row("old", 500, 0), row("new", 50, 50)], "new").ok).toBe(false);
  });

  it("honours a configured margin and minimum sample", () => {
    const rows = [row("old", 1000, 0), row("new", 100, 3)];
    expect(judgeSoak(rows, "new", { maxExtraErrorPoints: 5, minRequests: 50 }).ok).toBe(true);
    expect(judgeSoak(rows, "new", { maxExtraErrorPoints: 1, minRequests: 50 }).ok).toBe(false);
    expect(judgeSoak(rows, "new", { maxExtraErrorPoints: 1, minRequests: 500 }).lowSample).toBe(
      true,
    );
  });

  it("reads thresholds from the environment, treating unset and empty as the default", () => {
    expect(numberFromEnv("X", 10, {})).toBe(10);
    expect(numberFromEnv("X", 10, { X: "" })).toBe(10);
    expect(numberFromEnv("X", 10, { X: "2.5" })).toBe(2.5);
    expect(() => numberFromEnv("X", 10, { X: "soon" })).toThrow(/non-negative number/);
    expect(() => numberFromEnv("X", 10, { X: "-1" })).toThrow(/non-negative number/);
  });
});
