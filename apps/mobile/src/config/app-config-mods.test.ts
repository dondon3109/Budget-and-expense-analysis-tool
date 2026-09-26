/**
 * @jest-environment node
 */
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

// Resolves the native config exactly as `expo config --type introspect` does,
// so plugins that prebuild applies on its own (expo-notifications is applied
// whenever it is installed) are part of what this checks. Both modules are
// loaded from @expo/cli's own dependencies, the copies the CLI uses.
const cliRequire = createRequire(
  createRequire(require.resolve("expo/package.json")).resolve("@expo/cli/package.json"),
);
const { getPrebuildConfigAsync } = cliRequire("@expo/prebuild-config") as {
  getPrebuildConfigAsync: (
    projectRoot: string,
    options: { platforms: string[] },
  ) => Promise<{ exp: unknown }>;
};
const { compileModsAsync } = cliRequire("@expo/config-plugins/build/plugins/mod-compiler.js") as {
  compileModsAsync: (config: unknown, options: Record<string, unknown>) => Promise<unknown>;
};

interface IntrospectedConfig {
  _internal: {
    modResults: {
      ios: { entitlements: Record<string, unknown> };
      android: {
        manifest: {
          manifest: {
            application: { "meta-data"?: { $: Record<string, string> }[] }[];
          };
        };
      };
    };
  };
}

async function introspect(variant: string): Promise<IntrospectedConfig> {
  const projectRoot = path.resolve(__dirname, "../..");
  const original = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    const { exp } = await getPrebuildConfigAsync(projectRoot, { platforms: ["ios", "android"] });
    await compileModsAsync(exp, {
      projectRoot,
      introspect: true,
      platforms: ["ios", "android"],
      assertMissingModProviders: false,
    });
    return exp as unknown as IntrospectedConfig;
  } finally {
    if (original === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = original;
  }
}

describe("native config produced by prebuild", () => {
  it("ships no push entitlement and a monochrome Android notification icon", async () => {
    const config = await introspect("production");
    const { ios, android } = config._internal.modResults;

    // Local reminders need no push; the entitlement would force the Push
    // Notifications capability onto every iOS provisioning profile.
    expect(ios.entitlements).not.toHaveProperty("aps-environment");

    const metaData = android.manifest.manifest.application[0]?.["meta-data"] ?? [];
    expect(metaData.map((entry) => entry.$)).toContainEqual({
      "android:name": "expo.modules.notifications.default_notification_icon",
      "android:resource": "@drawable/notification_icon",
    });
  }, 60_000);
});
