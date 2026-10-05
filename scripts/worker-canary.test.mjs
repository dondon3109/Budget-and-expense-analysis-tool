import { describe, expect, it } from "vitest";

import { atomicSettings, judgeSoak, overrideHeader, servingVersion } from "./worker-canary.mjs";

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
    const varsOnly = structuredClone(config);
    varsOnly.env.production.vars.A = "2";
    expect(atomicSettings(varsOnly)).toBe(atomicSettings(config));

    const migrated = structuredClone(config);
    migrated.migrations.push({ tag: "v2" });
    expect(atomicSettings(migrated)).not.toBe(atomicSettings(config));

    const consumers = structuredClone(config);
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
    expect(judgeSoak([row("old", 500, 1), row("new", 50, 0)], "new").ok).toBe(true);
    expect(judgeSoak([row("old", 500, 1), row("new", 50, 5)], "new")).toMatchObject({
      ok: false,
      summary: expect.stringContaining("errors more than the old one"),
    });
    // A handful of requests says nothing about a rate; the probes decide instead.
    expect(judgeSoak([row("old", 500, 0), row("new", 3, 3)], "new")).toMatchObject({
      ok: true,
      summary: expect.stringContaining("too little traffic"),
    });
  });
});
