/**
 * @jest-environment node
 */
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "../..");

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

/**
 * Resolves the native config through the public `expo config --type introspect`
 * command, so plugins that prebuild applies on its own (expo-notifications is
 * applied whenever it is installed) are part of what this checks.
 */
async function introspect(variant: string): Promise<IntrospectedConfig> {
  const { stdout } = await execFileAsync(
    path.join(projectRoot, "node_modules/.bin/expo"),
    ["config", "--type", "introspect", "--json"],
    {
      cwd: projectRoot,
      // Offline and without telemetry: the command must not depend on the network in CI.
      env: { ...process.env, APP_VARIANT: variant, EXPO_OFFLINE: "1", EXPO_NO_TELEMETRY: "1" },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout) as IntrospectedConfig;
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
