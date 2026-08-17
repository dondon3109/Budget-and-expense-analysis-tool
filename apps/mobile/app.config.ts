import type { ConfigContext, ExpoConfig } from "expo/config";
import { withAndroidManifest, type ConfigPlugin } from "expo/config-plugins";

const variants = {
  development: {
    name: "Zoption Dev",
    androidPackage: "site.zoption.android.dev",
    iosBundleIdentifier: "site.zoption.ios.dev",
    scheme: "zoption-dev",
  },
  preview: {
    name: "Zoption Preview",
    androidPackage: "site.zoption.android.preview",
    iosBundleIdentifier: "site.zoption.ios.preview",
    scheme: "zoption-preview",
  },
  production: {
    name: "Zoption Beta",
    androidPackage: "site.zoption.android",
    iosBundleIdentifier: "site.zoption.ios",
    scheme: "zoption",
  },
} as const;

export type AppVariant = keyof typeof variants;

function resolveVariant(value: string | undefined): AppVariant {
  if (value === "preview" || value === "production") return value;
  return "development";
}

function environmentValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The dev client needs SYSTEM_ALERT_WINDOW for its debug overlay. The
 * permission must not ship in preview/production builds, so strip it from
 * the generated manifest for every non-development variant.
 */
const withDevClientPermissionCleanup: ConfigPlugin = (config) => {
  const variant = resolveVariant(environmentValue(process.env.APP_VARIANT));
  if (variant === "development") {
    return config;
  }
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest["uses-permission"];
    if (permissions) {
      manifest["uses-permission"] = permissions.filter(
        (permission) => permission.$["android:name"] !== "android.permission.SYSTEM_ALERT_WINDOW",
      );
    }
    return cfg;
  });
};

/**
 * The RN 0.86 template enables OnBackInvokedCallback by default, and with it
 * the system finished the activity instead of popping the native stack -
 * the back button closed the app from any pushed screen. Remove the
 * attribute for every variant so back handling falls to the legacy path
 * that react-native-screens pops correctly.
 */
const withLegacyBackHandling: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application?.$) {
      delete application.$["android:enableOnBackInvokedCallback"];
    }
    return cfg;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  const appVariant = resolveVariant(environmentValue(process.env.APP_VARIANT));
  const variant = variants[appVariant];

  return {
    ...config,
    name: variant.name,
    slug: "zoption-mobile",
    version: "0.1.1",
    icon: "./assets/zoption-icon.png",
    scheme: variant.scheme,
    userInterfaceStyle: "automatic",
    runtimeVersion: { policy: "appVersion" },
    ios: {
      bundleIdentifier: variant.iosBundleIdentifier,
      supportsTablet: true,
      usesAppleSignIn: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: true,
        NSMicrophoneUsageDescription:
          "Zoption records your questions only when you choose voice input. Recordings are sent to Zoption for transcription and are not stored.",
      },
    },
    android: {
      package: variant.androidPackage,
      versionCode: 20201,
      allowBackup: false,
      // Predictive back is disabled: with enableOnBackInvokedCallback the
      // system finished the activity instead of popping the native stack,
      // closing the app whenever the user pressed back from a pushed screen.
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#06473d",
          image: "./assets/zoption-icon.png",
          imageWidth: 180,
          dark: { backgroundColor: "#0f1115" },
        },
      ],
      ["expo-sqlite", { useSQLCipher: true }],
      [
        "expo-image-picker",
        {
          cameraPermission:
            "Zoption uses the camera to scan receipts into expense transactions.",
        },
      ],
      ["expo-secure-store", { configureAndroidBackup: true }],
      [
        "expo-audio",
        {
          microphonePermission:
            "Zoption records your questions only when you choose voice input. Recordings are sent to Zoption for transcription and are not stored.",
        },
      ],
      // Function plugins are supported at runtime; the ExpoConfig plugin
      // element type just does not model them.
      withDevClientPermissionCleanup as unknown as [string, unknown],
      withLegacyBackHandling as unknown as [string, unknown],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appVariant,
    },
  };
};
