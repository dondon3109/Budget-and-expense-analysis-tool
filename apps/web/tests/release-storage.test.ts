import { describe, expect, it } from "vitest";

import {
  hasAcknowledgedRelease,
  parseReleaseAwarenessRecord,
  persistReleaseAwarenessRecord,
  readReleaseAwarenessRecord,
} from "../src/releases/releaseStorage";

describe("release awareness storage", () => {
  it("accepts a valid current-version acknowledgement", () => {
    const value = JSON.stringify({
      schemaVersion: 1,
      acknowledgedVersion: "1.0.0",
      acknowledgedAt: "2026-07-29T12:00:00.000Z",
    });

    expect(hasAcknowledgedRelease("1.0.0", value)).toBe(true);
    expect(hasAcknowledgedRelease("1.0.1", value)).toBe(false);
  });

  it("rejects malformed and outdated schema records", () => {
    expect(parseReleaseAwarenessRecord("not json")).toBeNull();
    expect(
      parseReleaseAwarenessRecord(
        JSON.stringify({
          schemaVersion: 0,
          acknowledgedVersion: "1.0.0",
          acknowledgedAt: "2026-07-29",
        }),
      ),
    ).toBeNull();
  });

  it("handles unavailable storage without throwing", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(readReleaseAwarenessRecord(unavailable)).toBeNull();
    expect(persistReleaseAwarenessRecord("1.0.0", unavailable)).toBe(false);
  });
});
