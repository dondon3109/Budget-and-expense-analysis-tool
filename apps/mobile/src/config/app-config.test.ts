import process from "node:process";

import type { ConfigContext, ExpoConfig } from "expo/config";

import packageJson from "../../package.json";

import createConfig from "../../app.config";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function configFor(environment: Record<string, string | undefined>): ExpoConfig {
  const original: Record<string, string | undefined> = {
    APP_VARIANT: optionalString(process.env.APP_VARIANT),
    ZOPTION_DISTRIBUTION: optionalString(process.env.ZOPTION_DISTRIBUTION),
  };
  try {
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return createConfig({ config: {} } as ConfigContext);
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("mobile app configuration", () => {
  it("resolves production variant configuration correctly", () => {
    const config = configFor({ APP_VARIANT: "production" });

    // The resolved version must be exactly what package.json declares - the
    // single source of truth - not a separately maintained literal.
    expect(config.version).toBe(packageJson.version);
    expect(config.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(config.android).toMatchObject({
      package: "site.zoption.android",
      softwareKeyboardLayoutMode: "pan",
    });
    expect(config.android?.versionCode).toBeGreaterThan(0);
    expect(config.extra).toEqual({
      appVariant: "production",
      distribution: "apk",
    });
  });

  it("resolves development variant configuration correctly", () => {
    const config = configFor({ APP_VARIANT: "development" });

    expect(config.name).toBe("Zoption Dev");
    expect(config.android?.package).toBe("site.zoption.android.dev");
    expect(config.extra).toEqual({
      appVariant: "development",
      distribution: "apk",
    });
  });

  it("resolves preview variant configuration correctly", () => {
    const config = configFor({ APP_VARIANT: "preview" });

    expect(config.name).toBe("Zoption Preview");
    expect(config.android?.package).toBe("site.zoption.android.preview");
    expect(config.extra).toEqual({
      appVariant: "preview",
      distribution: "apk",
    });
  });

  it("keeps the sideloaded APK as the default distribution", () => {
    const config = configFor({ APP_VARIANT: "production", ZOPTION_DISTRIBUTION: undefined });

    expect(config.android?.blockedPermissions).toBeUndefined();
  });

  it("builds the Play distribution without the APK updater install permission", () => {
    const config = configFor({ APP_VARIANT: "production", ZOPTION_DISTRIBUTION: "play" });

    expect(config.android?.package).toBe("site.zoption.android");
    expect(config.android?.blockedPermissions).toEqual([
      "android.permission.REQUEST_INSTALL_PACKAGES",
    ]);
    expect(config.extra).toEqual({ appVariant: "production", distribution: "play" });
  });

  it("rejects an unknown distribution", () => {
    expect(() => configFor({ APP_VARIANT: "production", ZOPTION_DISTRIBUTION: "store" })).toThrow(
      'ZOPTION_DISTRIBUTION must be "apk" or "play"',
    );
  });
});
