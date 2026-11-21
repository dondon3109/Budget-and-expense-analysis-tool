import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pins the guards on the one exported activity that takes input from other apps.

const moduleRoot = resolve(__dirname, "../../../modules/zoption-share-intake/android/src/main");

function read(relativePath: string): string {
  return readFileSync(resolve(moduleRoot, relativePath), "utf8");
}

describe("Android share intake", () => {
  it("accepts only single receipt images and asks for no permission", () => {
    const manifest = read("AndroidManifest.xml");
    expect(manifest).toContain("android.intent.action.SEND");
    expect(manifest).not.toContain("SEND_MULTIPLE");
    expect(manifest).not.toContain("uses-permission");
    expect(manifest).not.toContain('android:mimeType="image/*"');
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(manifest).toContain(`android:mimeType="${type}"`);
    }
  });

  it("copies only content from other apps, capped at the extract route's 8 MB", () => {
    const store = read("java/site/zoption/shareintake/ZoptionSharedReceiptStore.kt");
    expect(store).toContain("uri.scheme != ContentResolver.SCHEME_CONTENT");
    expect(store).toContain("uri.authority?.startsWith(context.packageName) != false");
    expect(store).toContain("MAX_BYTES = 8L * 1024 * 1024");
    expect(store).toContain("context.cacheDir");
    expect(store).toContain("acceptAsync");
  });

  it("copies shared streams off the main thread before launching the app", () => {
    const activity = read("java/site/zoption/shareintake/ZoptionShareReceiverActivity.kt");
    expect(activity).toContain("ZoptionSharedReceiptStore.acceptAsync");
    expect(activity).toContain("runOnUiThread");
  });
});
