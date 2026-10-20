import "react-native-gesture-handler";
import "@/styles/global.css";

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider, useSessionSnapshot } from "@/auth/session-state";
import { WorkerIdentityProvider } from "@/auth/worker-identity-state";
import { configureConnectivity } from "@/config/connectivity";
import { markStartupPhase } from "@/diagnostics/startup-timing";
import { warmUpSounds } from "@/features/sounds/sound-effects";
import { useDailyReminderSession } from "@/features/reminders/daily-reminder";
import { AndroidUpdateProvider } from "@/features/updates";
import { CrashScreen } from "@/features/navigation/CrashScreen";
import { useMicCaptureConsentStore } from "@/features/voice/mic-capture-consent";
import { useReduceMotionStore } from "@/stores/reduce-motion-store";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";
import { useAssistantVoiceOptionsStore } from "@/stores/assistant-voice-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { useLastUsedAccountStore } from "@/stores/last-used-account-store";
import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import { registerBackgroundSyncTask } from "@/sync/background-sync-task";
import { telemetry } from "@/telemetry/telemetry";
import { ZoptionThemeProvider, useZoptionTheme } from "@/ui/theme-provider";

// The splash auto-hides as soon as the first frame draws, which is the bare
// spinner in SessionRedirectScreen. Holding it is only possible from module scope,
// before that first frame; SplashRelease below lets it go once the route is
// known, or after SPLASH_HOLD_LIMIT_MS if the session never settles.
void SplashScreen.preventAutoHideAsync();

// Bundled asset, and every screen draws icons. Starting the load here is the
// earliest possible point; @expo/vector-icons paints an empty glyph until it
// resolves, so this keeps the first frame from popping icons in afterwards.
void MaterialCommunityIcons.loadFont().catch(() => undefined);

markStartupPhase("bundle");

/** Upper bound on the splash hold, so a stalled session cannot strand it. */
const SPLASH_HOLD_LIMIT_MS = 4_000;

/** Releases the native splash once the stored session has resolved. */
function SplashRelease() {
  const session = useSessionSnapshot();
  const resolved = session.status !== "loading";

  useEffect(() => {
    if (!resolved) return;
    markStartupPhase("session:resolved");
    void SplashScreen.hideAsync();
  }, [resolved]);

  useEffect(() => {
    const limit = setTimeout(() => void SplashScreen.hideAsync(), SPLASH_HOLD_LIMIT_MS);
    return () => clearTimeout(limit);
  }, []);

  return null;
}

/** Restores the daily reminder for a signed-in session and clears it otherwise. */
function DailyReminderSession() {
  useDailyReminderSession(useSessionSnapshot().status);
  return null;
}

function RootNavigator() {
  const theme = useZoptionTheme();
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.canvas },
          headerTintColor: theme.colors.brand,
        }}
      >
        <Stack.Screen name="(public)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: "Not found" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    configureConnectivity();
    // Inert unless the build embeds EXPO_PUBLIC_POSTHOG_KEY; init resolves
    // even when the telemetry backend fails, so startup is never affected.
    // One app_session_started per launch is the first step of the
    // launch-to-first-transaction funnel; the device id lives only this launch.
    void telemetry.init();
    void telemetry.capture("app_session_started");
    warmUpSounds();
    void registerBackgroundSyncTask().catch(() => {
      // Background sync is a best-effort convenience; registration failure must
      // never affect foreground behavior.
    });
    markStartupPhase("boot:services");
  }, []);

  // These stores set skipHydration, so a saved value is only read when something
  // asks for it. Without this the voice language, reduce motion, assistant voice options, mic
  // capture consent, and last used account all start at their defaults
  // on every launch. The theme store hydrates in ZoptionThemeProvider, which
  // renders nothing until it has. The daily reminder store hydrates in
  // DailyReminderSession, once the session is known to be signed in.
  useEffect(() => {
    void useVoiceLanguageStore.persist.rehydrate();
    void useSoundEffectsStore.persist.rehydrate();
    void useReduceMotionStore.persist.rehydrate();
    void useAssistantVoiceOptionsStore.persist.rehydrate();
    void useMicCaptureConsentStore.persist.rehydrate();
    void useLastUsedAccountStore.persist.rehydrate();
    void useWorkspaceCurrencyStore.persist.rehydrate();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Android keeps the manifest's pan mode; only a chat screen's KeyboardAvoidingView
            switches to resize while it is mounted, so the composer sits on the keyboard. */}
        <KeyboardProvider>
          <SessionProvider>
            <SplashRelease />
            <DailyReminderSession />
            <WorkerIdentityProvider>
              <ZoptionThemeProvider>
                <AndroidUpdateProvider>
                  <RootNavigator />
                </AndroidUpdateProvider>
              </ZoptionThemeProvider>
            </WorkerIdentityProvider>
          </SessionProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // A boot failure must not be hidden behind a splash that never lifts.
    void SplashScreen.hideAsync();
    void telemetry.captureException(error, "root-error-boundary");
  }, [error]);
  return (
    <SafeAreaProvider>
      <ZoptionThemeProvider>
        <CrashScreen error={error} retry={retry} />
      </ZoptionThemeProvider>
    </SafeAreaProvider>
  );
}
