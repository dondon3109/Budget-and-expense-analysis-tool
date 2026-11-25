import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppLockUnlocked } from "@/features/app-lock/AppLockGate";
import { useAccountPromptStore } from "@/features/account-prompt/account-prompt-store";
import { usePlanLimitOpen } from "@/features/billing/PlanLimitDialog";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useThankYouOpen } from "@/features/thank-you/ThankYouHost";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAccountLink } from "@/telemetry/account-link";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

import {
  checkForPlayUpdate,
  openPlayListing,
  readDismissedPlayUpdateVersion,
  saveDismissedPlayUpdateVersion,
  shouldPromptForPlayUpdate,
  shouldRunPlayUpdateCheck,
} from "./play-store";

const PLAY_UPDATE_CHECK_TIMEOUT_MS = 5_000;

interface PlayUpdateOverlayState {
  checking: boolean;
  visible: boolean;
}

let overlayState: PlayUpdateOverlayState = { checking: false, visible: false };
const overlayListeners = new Set<() => void>();

function publishOverlayState(next: PlayUpdateOverlayState): void {
  if (overlayState.checking === next.checking && overlayState.visible === next.visible) return;
  overlayState = next;
  for (const listener of overlayListeners) listener();
}

function subscribeOverlayState(listener: () => void): () => void {
  overlayListeners.add(listener);
  return () => {
    overlayListeners.delete(listener);
  };
}

/**
 * True while the initial Play Store check is in flight or the update modal is visible, so lower
 * priority pop-ups (such as PetMomentModal) wait instead of stacking two Android modals at once.
 */
export function usePlayUpdatePromptPending(): boolean {
  const state = useSyncExternalStore(subscribeOverlayState, () => overlayState);
  return state.checking || state.visible;
}

/** Clears module state between tests. */
export function resetPlayUpdatePromptStateForTests(): void {
  publishOverlayState({ checking: false, visible: false });
}

function checkWithTimeout(): ReturnType<typeof checkForPlayUpdate> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PLAY_UPDATE_CHECK_TIMEOUT_MS);
  });
  return Promise.race([checkForPlayUpdate(), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Checks Google Play for an available update on Android and displays a modal offering Update or
 * Not now. Waits for the app lock and higher-priority startup prompts so two Android native modals
 * never compete for focus.
 */
export function PlayUpdatePromptHost() {
  const theme = useZoptionTheme();
  const appUnlocked = useAppLockUnlocked();
  const thankYouOpen = useThankYouOpen();
  const planLimitOpen = usePlanLimitOpen();
  const accountPromptOpen = useAccountPromptStore((state) => state.feature !== null);
  const analyticsPending = useAccountLink().pending;
  const setupOpen = useOnboardingStore((state) => state.open);
  const setupPending = useOnboardingStore(
    (state) => state.state !== null && state.state.step !== "complete" && !state.dismissed,
  );

  const [availableVersionCode, setAvailableVersionCode] = useState<number | null>(null);
  const [checkingInitial, setCheckingInitial] = useState(false);

  const inFlightRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const sessionDismissedRef = useRef<number | null>(null);
  const initialCheckedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !appUnlocked) return;
    let active = true;

    const runCheck = async () => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (!shouldRunPlayUpdateCheck({ lastCheckedAt: lastCheckedAtRef.current, now })) return;
      inFlightRef.current = true;
      const isInitial = !initialCheckedRef.current;
      if (isInitial) setCheckingInitial(true);
      try {
        const [update, dismissedVersionCode] = await Promise.all([
          checkWithTimeout(),
          readDismissedPlayUpdateVersion(),
        ]);
        if (!active) return;
        lastCheckedAtRef.current = Date.now();
        initialCheckedRef.current = true;
        if (
          update &&
          shouldPromptForPlayUpdate({
            availableVersionCode: update.availableVersionCode,
            dismissedVersionCode,
            sessionDismissedVersion: sessionDismissedRef.current,
          })
        ) {
          setAvailableVersionCode(update.availableVersionCode);
        } else {
          setAvailableVersionCode(null);
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current && isInitial) setCheckingInitial(false);
      }
    };

    void runCheck();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void runCheck();
    });

    return () => {
      active = false;
      subscription.remove();
      setCheckingInitial(false);
    };
  }, [appUnlocked]);

  const blocked =
    !appUnlocked ||
    thankYouOpen ||
    planLimitOpen ||
    accountPromptOpen ||
    analyticsPending ||
    setupOpen ||
    setupPending;
  const visible = availableVersionCode !== null && !blocked;

  useEffect(() => {
    publishOverlayState({ checking: checkingInitial, visible });
    return () => publishOverlayState({ checking: false, visible: false });
  }, [checkingInitial, visible]);

  const handleNotNow = () => {
    const version = availableVersionCode;
    setAvailableVersionCode(null);
    if (version !== null) {
      sessionDismissedRef.current = version;
      void saveDismissedPlayUpdateVersion(version);
    }
  };

  const handleUpdate = () => {
    const version = availableVersionCode;
    setAvailableVersionCode(null);
    if (version !== null) {
      sessionDismissedRef.current = version;
    }
    void openPlayListing();
  };

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible={visible}
      onRequestClose={handleNotNow}
    >
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          accessibilityLabel="Close update dialog"
          style={StyleSheet.absoluteFill}
          onPress={withTapSound(handleNotNow)}
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[
            styles.card,
            elevation.dialog,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: theme.colors.brandSoft }]}>
            <MaterialCommunityIcons
              name="cellphone-arrow-down"
              size={28}
              color={theme.colors.brand}
            />
          </View>
          <Text
            accessibilityRole="header"
            style={[typography.title, styles.centered, { color: theme.colors.text }]}
          >
            Update available
          </Text>
          <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
            A newer version of Zoption is available on Google Play. Update now for the latest
            improvements and fixes.
          </Text>
          <Button variant="primary" onPress={handleUpdate}>
            Update
          </Button>
          <Button variant="secondary" onPress={handleNotNow}>
            Not now
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: "stretch",
  },
  icon: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { textAlign: "center" },
});
