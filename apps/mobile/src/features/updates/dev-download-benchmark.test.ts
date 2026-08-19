import { File } from "expo-file-system";

import { runDownloadBenchmark } from "./dev-download-benchmark";
import { VALID_APK_SHA256, validInspection, validRemoteMetadata } from "./test-fixtures";

jest.mock("expo-file-system", () => {
  return {
    Paths: { cache: "file:///cache" },
    Directory: class {
      uri = "";
      exists = true;
      constructor(...parts: string[]) {
        this.uri = parts.join("/");
      }
      create() {
        this.exists = true;
      }
      list(): never[] {
        return [];
      }
    },
    File: class {
      static downloadFileAsync: jest.Mock = jest.fn();
      uri = "";
      size = 0;
      exists = false;
      constructor(uri: string) {
        this.uri = uri;
      }
      delete() {
        this.exists = false;
      }
    },
  };
});

const downloadFileAsync = File.downloadFileAsync as jest.Mock;

const mockNative = {
  getInstalledPackageInfoAsync: jest.fn(async () => ({
    packageName: "site.zoption.android",
    versionName: "0.2.0-beta",
    versionCode: 20300,
  })),
  digestFileSha256Async: jest.fn(async () => VALID_APK_SHA256),
  inspectApkAsync: jest.fn(async () => validInspection()),
  verifyApkAsync: jest.fn(async () => validInspection()),
  canInstallPackagesAsync: jest.fn(async () => true),
  openUnknownSourcesSettingsAsync: jest.fn(async () => undefined),
  installApkAsync: jest.fn(async () => undefined),
};

jest.mock("./apk-updater-native", () => ({
  getApkUpdaterNative: () => mockNative,
}));

const DESTINATION_URI = "file:///cache/apk-updates/zoption-20301.apk";

describe("runDownloadBenchmark", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    downloadFileAsync.mockReset();
    downloadFileAsync.mockResolvedValue({ uri: DESTINATION_URI, size: 1024 });
    mockNative.digestFileSha256Async.mockResolvedValue(VALID_APK_SHA256);
    mockNative.verifyApkAsync.mockResolvedValue(validInspection());
    global.fetch = jest.fn(async () => ({
      json: async () => validRemoteMetadata(),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("passes every security gate for a trusted release and reports timings", async () => {
    const result = await runDownloadBenchmark({ onProgress: jest.fn() });
    expect(result.ok).toBe(true);
    expect(result.gates).toEqual({
      trustedUrl: true,
      sizeMatches: true,
      sha256Matches: true,
      packageMatches: true,
      versionMatches: true,
      signerMatches: true,
      verifiedByNative: true,
      cleanedUp: true,
    });
    expect(result.release?.versionCode).toBe(20301);
    expect(result.timing.downloadSeconds).toBeGreaterThanOrEqual(0);
    expect(result.timing.downloadMbps).toBeGreaterThanOrEqual(0);
    expect(result.timing.hashMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.verifyMs).toBeGreaterThanOrEqual(0);
  });

  it("flags a gate failure and reports not ok when the digest mismatches", async () => {
    mockNative.digestFileSha256Async.mockResolvedValue(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    const result = await runDownloadBenchmark();
    expect(result.ok).toBe(false);
    expect(result.gates.sha256Matches).toBe(false);
    expect(result.gates.sizeMatches).toBe(true);
  });

  it("fails cleanly when latest.json is untrusted and still attempts cleanup", async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ version: "x", versionCode: 1, downloadUrl: "https://evil.example/x.apk" }),
    })) as unknown as typeof fetch;
    const result = await runDownloadBenchmark();
    expect(result.ok).toBe(false);
    expect(result.release).toBeNull();
  });
});