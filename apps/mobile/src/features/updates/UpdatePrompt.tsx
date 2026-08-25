import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

import {
  formatApkSize,
  formatDownloadProgress,
  normalizeReleaseNotes,
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
  const isUpdatePrompt =
    promptVisible &&
    updates.prompt === "available" &&
    Boolean(updates.installed && updates.latest);
  const notes = updates.latest ? normalizeReleaseNotes(updates.latest.notes) : [];

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => void updates.later()}>
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        {promptVisible ? (
          <Pressable
            accessibilityLabel="Dismiss update dialog"
            style={StyleSheet.absoluteFill}
            onPress={() => void updates.later()}
          />
        ) : null}
        <View
          accessibilityRole="alert"
          style={[
            styles.dialog,
            elevation.dialog,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: overlayIconBadgeBg(updates, theme) },
              ]}
            >
              <MaterialCommunityIcons
                name={overlayIcon(updates)}
                size={22}
                color={overlayIconColor(updates, theme)}
              />
            </View>
            <View style={styles.headerText}>
              <Text
                accessibilityRole="header"
                style={[typography.title, { color: theme.colors.text }]}
              >
                {title}
              </Text>
              {isUpdatePrompt && updates.installed && updates.latest ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {`You have ${updates.installed.versionName}. Version ${updates.latest.versionName} is ${formatApkSize(updates.latest.size)}.`}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Main Body */}
          {isUpdatePrompt ? (
            <UpdatePromptContent updates={updates} notes={notes} />
          ) : (
            <PromptStatusBody updates={updates} />
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <OverlayActions updates={updates} promptVisible={promptVisible} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UpdatePromptContent({
  updates,
  notes,
}: {
  updates: AndroidUpdateController;
  notes: readonly string[];
}) {
  const theme = useZoptionTheme();

  if (notes.length === 0) {
    return (
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        {updates.installed && updates.latest
          ? updateAvailableMessage(updates.installed, updates.latest)
          : "A newer Zoption Beta is available."}
      </Text>
    );
  }

  return (
    <View style={styles.notesSection}>
      <Text style={[typography.label, { color: theme.colors.textMuted }]}>WHAT’S NEW</Text>
      <View
        style={[
          styles.scrollContainer,
          { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
        ]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
          bounces={false}
        >
          {notes.map((note, index) => (
            <View key={index} style={styles.noteItem}>
              <View style={[styles.bulletDot, { backgroundColor: theme.colors.brand }]} />
              <Text style={[typography.callout, styles.noteText, { color: theme.colors.text }]}>
                {note}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function PromptStatusBody({ updates }: { updates: AndroidUpdateController }) {
  const theme = useZoptionTheme();
  const message = overlayMessage(updates);

  if (updates.status === "verifying") {
    return (
      <View style={styles.centerStatus}>
        <ActivityIndicator color={theme.colors.brand} style={{ marginBottom: spacing.sm }} />
        <Text style={[typography.body, { color: theme.colors.textMuted, textAlign: "center" }]}>
          {message}
        </Text>
      </View>
    );
  }

  if (updates.status === "downloading") {
    return (
      <View style={styles.downloadStatus}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>{message}</Text>
        {updates.progress ? (
          <ProgressBar
            bytesWritten={updates.progress.bytesWritten}
            totalBytes={updates.progress.totalBytes}
          />
        ) : null}
      </View>
    );
  }

  return <Text style={[typography.body, { color: theme.colors.textMuted }]}>{message}</Text>;
}

function ProgressBar({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) {
  const theme = useZoptionTheme();
  const percent =
    totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((bytesWritten / totalBytes) * 100))) : 0;
  return (
    <View
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.progressTrack, { backgroundColor: theme.colors.canvasMuted }]}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${percent}%`, backgroundColor: theme.colors.brand },
        ]}
      />
    </View>
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

function overlayIcon(
  updates: AndroidUpdateController,
): keyof typeof MaterialCommunityIcons.glyphMap {
  if (updates.status === "downloading") return "download-outline";
  if (updates.status === "verifying") return "shield-check-outline";
  if (updates.status === "needsPermission") return "shield-alert-outline";
  if (updates.status === "installing") return "package-variant";
  if (updates.status === "failed") return "alert-circle-outline";
  if (updates.prompt === "reinstallRequired") return "alert-decagram-outline";
  return "cellphone-arrow-down";
}

function overlayIconBadgeBg(
  updates: AndroidUpdateController,
  theme: ReturnType<typeof useZoptionTheme>,
) {
  if (updates.status === "failed") return theme.colors.dangerSoft;
  if (updates.status === "needsPermission" || updates.prompt === "reinstallRequired") {
    return theme.colors.warningSoft;
  }
  return theme.colors.brandSoft;
}

function overlayIconColor(
  updates: AndroidUpdateController,
  theme: ReturnType<typeof useZoptionTheme>,
): string {
  if (updates.status === "failed") return theme.colors.danger as string;
  if (updates.status === "needsPermission" || updates.prompt === "reinstallRequired") {
    return theme.colors.warning as string;
  }
  return theme.colors.brand as string;
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
  layer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  notesSection: {
    gap: spacing.xs,
  },
  scrollContainer: {
    maxHeight: 200,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  centerStatus: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  downloadStatus: {
    gap: spacing.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});

