import { downloadReleaseApk, isTrustedDownloadUrl } from "./apk-download";
import type { UpdateFileSystem } from "./update-filesystem";
import { parsedRelease } from "./test-fixtures";

function memoryFileSystem(options: { fail?: boolean; size?: number } = {}): UpdateFileSystem & {
  deleted: string[];
} {
  const deleted: string[] = [];
  return {
    deleted,
    ensureUpdateDirectory: async () => "file:///cache/apk-updates/",
    downloadToFile: async ({ url, destinationUri }) => {
      if (options.fail) throw new Error("network down");
      expect(url).toBe(parsedRelease().downloadUrl);
      return { uri: destinationUri, size: options.size ?? 1024 };
    },
    fileSize: async () => options.size ?? 1024,
    deleteUri: async (uri) => {
      deleted.push(uri);
    },
    listUpdateFiles: async () => [],
  };
}

describe("APK download", () => {
  it("downloads only the exact validated HTTPS URL", async () => {
    const fileSystem = memoryFileSystem();
    const result = await downloadReleaseApk({
      release: parsedRelease(),
      fileSystem,
    });
    expect(result.uri).toBe("file:///cache/apk-updates/zoption-20301.apk");
    expect(result.size).toBe(1024);
    expect(fileSystem.deleted).toEqual([]);
  });

  it("deletes a partial file after a failed download", async () => {
    const fileSystem = memoryFileSystem({ fail: true });
    await expect(
      downloadReleaseApk({ release: parsedRelease(), fileSystem }),
    ).rejects.toMatchObject({ code: "failed" });
    expect(fileSystem.deleted).toContain("file:///cache/apk-updates/zoption-20301.apk");
  });

  it("deletes a cancelled download and never treats it as complete", async () => {
    const controller = new AbortController();
    const fileSystem: UpdateFileSystem & { deleted: string[] } = {
      deleted: [],
      ensureUpdateDirectory: async () => "file:///cache/apk-updates/",
      downloadToFile: async ({ destinationUri, signal }) => {
        controller.abort();
        if (signal?.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
        return { uri: destinationUri, size: 12 };
      },
      fileSize: async () => 12,
      deleteUri: async (uri) => {
        fileSystem.deleted.push(uri);
      },
      listUpdateFiles: async () => [],
    };
    await expect(
      downloadReleaseApk({
        release: parsedRelease(),
        fileSystem,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(fileSystem.deleted).toContain("file:///cache/apk-updates/zoption-20301.apk");
  });

  it("rejects URLs that are not the trusted download host", () => {
    expect(isTrustedDownloadUrl("https://evil.example/android/zoption.apk")).toBe(false);
    expect(isTrustedDownloadUrl("http://downloads.zoption.site/android/zoption.apk")).toBe(false);
    expect(
      isTrustedDownloadUrl("https://downloads.zoption.site/android/zoption-beta-0.2.1.apk"),
    ).toBe(true);
  });
});
