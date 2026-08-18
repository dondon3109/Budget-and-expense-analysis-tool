import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

import {
  formatDownloadProgress,
  reinstallRequiredMessage,
  updateAvailableMessage,
} from "./update-copy";
import { useOptionalAndroidUpdates, type AndroidUpdateController } from "./use-android-updates";

export function AndroidUpdateOverlay() {
  const updates = useOptionalAndroidUpdates();
  if (!updates?.supported) return null;
  return <AndroidUpdateOverlayView updates={updates} />;
}

export function AndroidUpdateOverlayView({ updates }: { updates: AndroidUpdateController }) {
  const theme = useZoptionTheme();
  const flowVisible =
    updates.status === "downloading" ||
    updates.status === "verifying" ||
    updates.status === "needsPermission" ||
    updates.status === "installing" ||
    updates.status === "failed";
  const promptVisible = updates.prompt !== "hidden" && !flowVisible;
  const visible = promptVisible || flowVisible;
  if (!visible) return null;

  const title = overlayTitle(updates);
  const message = overlayMessage(updates);

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => void updates.later()}>
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        {promptVisible ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => void updates.later()} />
        ) : null}
        <View
          accessibilityRole="alert"
          style={[styles.dialog, elevation.dialog, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>{message}</Text>
          <View className="flex-row justify-end gap-2">
            <OverlayActions updates={updates} promptVisible={promptVisible} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OverlayActions({
  updates,
  promptVisible,
}: {
  updates: AndroidUpdateController;
  promptVisible: boolean;
}) {
  if (promptVisible && updates.prompt === "reinstallRequired") {
    return (
      <>
        <Button variant="quiet" onPress={() => void updates.later()}>
          Later
        </Button>
        <Button onPress={() => void updates.openInstallPage()}>Open install page</Button>
      </>
    );
  }
  if (promptVisible) {
    return (
      <>
        <Button variant="quiet" onPress={() => void updates.later()}>
          Later
        </Button>
        <Button onPress={() => void updates.updateNow()}>Update now</Button>
      </>
    );
  }
  if (updates.status === "downloading") {
    return (
      <Button variant="secondary" onPress={updates.cancelDownload}>
        Cancel
      </Button>
    );
  }
  if (updates.status === "needsPermission") {
    return (
      <>
        <Button variant="quiet" onPress={() => void updates.later()}>
          Later
        </Button>
        <Button onPress={() => void updates.openUnknownSourcesSettings()}>Allow installs</Button>
      </>
    );
  }
  if (updates.status === "failed") {
    return (
      <>
        <Button variant="quiet" onPress={() => void updates.later()}>
          Close
        </Button>
        <Button onPress={() => void updates.updateNow()}>Try again</Button>
      </>
    );
  }
  return null;
}

function overlayTitle(updates: AndroidUpdateController): string {
  if (updates.status === "downloading") return "Downloading update";
  if (updates.status === "verifying") return "Verifying update";
  if (updates.status === "needsPermission") return "Allow Zoption to install updates";
  if (updates.status === "installing") return "Install the update";
  if (updates.status === "failed") return "Update could not continue";
  if (updates.prompt === "reinstallRequired") return "Fresh install required";
  return "Update available";
}

function overlayMessage(updates: AndroidUpdateController): string {
  if (updates.status === "downloading") {
    return updates.progress
      ? formatDownloadProgress(updates.progress.bytesWritten, updates.progress.totalBytes)
      : "Downloading the official Zoption update…";
  }
  if (updates.status === "verifying") {
    return "Checking the package, version, checksum, and signing certificate…";
  }
  if (updates.status === "needsPermission") {
    return "Android needs permission before Zoption can open the system installer. Allow installs for Zoption, then return here.";
  }
  if (updates.status === "installing") {
    return "Confirm the update in Android when prompted. Zoption will not install anything silently.";
  }
  if (updates.status === "failed") {
    return updates.error ?? "The update could not be completed.";
  }
  if (updates.latest && updates.prompt === "reinstallRequired") {
    return reinstallRequiredMessage(updates.latest);
  }
  if (updates.installed && updates.latest) {
    return updateAvailableMessage(updates.installed, updates.latest);
  }
  return "A newer Zoption Beta is available.";
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  dialog: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
