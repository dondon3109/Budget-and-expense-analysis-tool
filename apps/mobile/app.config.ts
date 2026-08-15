import type { ConfigContext, ExpoConfig } from "expo/config";

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
    name: "Zoption",
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

export default ({ config }: ConfigContext): ExpoConfig => {
  const appVariant = resolveVariant(process.env.APP_VARIANT);
  const variant = variants[appVariant];

  return {
    ...config,
    name: variant.name,
    slug: "zoption-mobile",
    version: "0.1.0",
    icon: "../android/store_icon.png",
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
      allowBackup: false,
      predictiveBackGestureEnabled: true,
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#06473d",
          image: "../android/store_icon.png",
          imageWidth: 180,
          dark: { backgroundColor: "#0f1115" },
        },
      ],
      ["expo-sqlite", { useSQLCipher: true }],
      ["expo-secure-store", { configureAndroidBackup: true }],
      ["expo-audio", { microphonePermission: "Zoption records your questions only when you choose voice input. Recordings are sent to Zoption for transcription and are not stored." }],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appVariant,
    },
  };
};
