import process from "node:process";

import type { ConfigContext, ExpoConfig } from "expo/config";

import createConfig from "../../app.config";

const PROJECT_ID = "9f20b628-1869-4f69-94d6-b4237a682ac0";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function configFor(environment: Record<string, string | undefined>): ExpoConfig {
  const original: Record<string, string | undefined> = {
    APP_VARIANT: optionalString(process.env.APP_VARIANT),
    EAS_PROJECT_ID: optionalString(process.env.EAS_PROJECT_ID),
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

describe("mobile OTA app configuration", () => {
  it("leaves OTA disabled when no project is configured", () => {
    const config = configFor({ APP_VARIANT: "production", EAS_PROJECT_ID: undefined });

    expect(config.updates).toEqual({ enabled: false });
    expect(config.version).toBe("0.2.7-beta");
    expect(config.android).toMatchObject({ package: "site.zoption.android", versionCode: 20307 });
    expect(config.runtimeVersion).toEqual({ policy: "appVersion" });
  });

  it("enables only the production channel when a valid project is embedded", () => {
    const config = configFor({ APP_VARIANT: "production", EAS_PROJECT_ID: PROJECT_ID });

    expect(config.updates).toEqual({
      enabled: true,
      url: `https://u.expo.dev/${PROJECT_ID}`,
      requestHeaders: { "expo-channel-name": "production" },
      codeSigningCertificate: "./certs/ota-production.pem",
      codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" },
      checkAutomatically: "ON_ERROR_RECOVERY",
      fallbackToCacheTimeout: 0,
    });
    expect(config.extra).toEqual({
      appVariant: "production",
      eas: { projectId: PROJECT_ID },
    });
  });

  it("keeps development clients off the OTA channel", () => {
    const config = configFor({ APP_VARIANT: "development", EAS_PROJECT_ID: PROJECT_ID });

    expect(config.updates).toEqual({ enabled: false });
  });

  it("rejects a malformed project ID before generating native configuration", () => {
    expect(() =>
      configFor({ APP_VARIANT: "production", EAS_PROJECT_ID: "not-a-project-id" }),
    ).toThrow("EAS_PROJECT_ID must be a valid UUID.");
  });
});
