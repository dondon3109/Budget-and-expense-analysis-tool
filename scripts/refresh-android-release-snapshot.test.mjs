import { describe, expect, it } from "vitest";

import { buildSnapshotFromRemote } from "./refresh-android-release-snapshot.mjs";

const PERMANENT_CERT =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";

const validRemote = {
  version: "0.2.7-beta",
  versionCode: 20307,
  downloadUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.7.apk",
  sha256: "a".repeat(64),
  certificateSha256: PERMANENT_CERT,
  size: 142945299,
  releasedAt: "2026-08-21",
  reinstallRequired: false,
  minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
  notes: ["First note.", "Second note.", "Third note."],
};

describe("buildSnapshotFromRemote", () => {
  it("builds the full fallback snapshot from valid live metadata", () => {
    const snapshot = buildSnapshotFromRemote(validRemote, { previous: { targetApi: 36 } });

    expect(snapshot).toMatchObject({
      packageId: "site.zoption.android",
      versionName: "0.2.7-beta",
      versionCode: 20307,
      filename: "zoption-beta-0.2.7.apk",
      downloadPath: "https://downloads.zoption.site/android/zoption-beta-0.2.7.apk",
      sha256: "a".repeat(64),
      releaseDate: "2026-08-21",
      releaseDateLabel: "August 21, 2026",
      minimumAndroid: "Android 7.0 or newer (API 24+)",
      targetApi: 36,
      certificateSha256: PERMANENT_CERT,
      reinstallRequired: false,
    });
    expect(snapshot.sizeLabel).toBe("142,945,299 bytes (136.32 MiB)");
    expect(snapshot.notes).toEqual(["First note.", "Second note.", "Third note."]);
    // checksumPath stays absent exactly like the committed snapshot.
    expect(Object.hasOwn(snapshot, "checksumPath")).toBe(false);
  });

  it("carries targetApi forward only when the previous snapshot provided one", () => {
    expect(buildSnapshotFromRemote(validRemote).targetApi).toBeUndefined();
    expect(buildSnapshotFromRemote(validRemote, { previous: {} }).targetApi).toBeUndefined();
  });

  it("rejects metadata signed by any other certificate", () => {
    const foreign = {
      ...validRemote,
      certificateSha256: "AB".repeat(32),
    };
    expect(() => buildSnapshotFromRemote(foreign, { previous: { targetApi: 36 } })).toThrow(
      /permanent Zoption certificate/,
    );
  });

  it("rejects payloads that fail the strict shared parser", () => {
    expect(() => buildSnapshotFromRemote({ ...validRemote, sha256: "nope" })).toThrow(
      /strict release-metadata validation/,
    );
    expect(() => buildSnapshotFromRemote({ ...validRemote, downloadUrl: "http://downloads.zoption.site/android/x.apk" })).toThrow(
      /strict release-metadata validation/,
    );
    expect(() => buildSnapshotFromRemote(null)).toThrow(/strict release-metadata validation/);
  });

  it("accepts a live channel at or above the committed versionCode", () => {
    const same = { previous: { targetApi: 36, versionCode: 20307 } };
    expect(buildSnapshotFromRemote(validRemote, same).versionCode).toBe(20307);
    const newer = { ...validRemote, versionCode: 20308 };
    expect(buildSnapshotFromRemote(newer, same).versionCode).toBe(20308);
    // No committed snapshot yet: anything valid is accepted.
    expect(buildSnapshotFromRemote(newer).versionCode).toBe(20308);
  });

  it("rejects a lower live versionCode unless a rollback is explicit", () => {
    const rolledBack = { previous: { targetApi: 36, versionCode: 20308 } };
    expect(() => buildSnapshotFromRemote(validRemote, rolledBack)).toThrow(
      /--allow-downgrade only for an intentional rollback/,
    );
    const snapshot = buildSnapshotFromRemote(validRemote, {
      ...rolledBack,
      allowDowngrade: true,
    });
    expect(snapshot.versionCode).toBe(20307);
  });

  it("ignores malformed previous versionCode values instead of failing", () => {
    const snapshot = buildSnapshotFromRemote(validRemote, {
      previous: { targetApi: 36, versionCode: "20307" },
    });
    expect(snapshot.versionCode).toBe(20307);
  });
});
