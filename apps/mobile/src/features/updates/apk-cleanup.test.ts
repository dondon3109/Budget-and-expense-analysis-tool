import { cleanupUpdateFiles, urisToDelete } from "./apk-cleanup";

describe("temporary APK cleanup", () => {
  it("deletes failed, cancelled, and obsolete updater files", () => {
    expect(
      urisToDelete({
        files: [
          "file:///cache/apk-updates/zoption-20300.apk",
          "file:///cache/apk-updates/zoption-20301.apk",
        ],
        reserved: {
          uri: "file:///cache/apk-updates/zoption-20301.apk",
          reservedUntil: 200,
        },
        now: 100,
      }),
    ).toEqual(["file:///cache/apk-updates/zoption-20300.apk"]);
  });

  it("keeps the reserved APK while the installer still needs it", () => {
    expect(
      urisToDelete({
        files: ["file:///cache/apk-updates/zoption-20301.apk"],
        reserved: {
          uri: "file:///cache/apk-updates/zoption-20301.apk",
          reservedUntil: 500,
        },
        now: 100,
      }),
    ).toEqual([]);
  });

  it("deletes the reserved APK after the installer reservation expires", async () => {
    const deleted: string[] = [];
    await cleanupUpdateFiles({
      listUpdateFiles: async () => ["file:///cache/apk-updates/zoption-20301.apk"],
      deleteUri: async (uri) => {
        deleted.push(uri);
      },
      reserved: {
        uri: "file:///cache/apk-updates/zoption-20301.apk",
        reservedUntil: 50,
      },
      now: 100,
    });
    expect(deleted).toEqual(["file:///cache/apk-updates/zoption-20301.apk"]);
  });
});
