import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import type { ParsedAndroidRelease } from "./android-release-metadata";
import {
  formatDownloadProgress,
  reinstallRequiredMessage,
  updateAvailableMessage,
} from "./update-copy";
import type { InstalledAndroidApp } from "./update-policy";
import type { DownloadProgress } from "./update-filesystem";
import { useOptionalAndroidUpdates, type ManualUpdateStatus } from "./use-android-updates";
import { UpdateDownloadBenchmarkCard } from "./UpdateDownloadBenchmarkCard";

export interface UpdateSettingsCardViewProps {
  supported: boolean;
  status: ManualUpdateStatus;
  installed: InstalledAndroidApp | null;
  latest: ParsedAndroidRelease | null;
  error: string | null;
  progress: DownloadProgress | null;
  onCheck: () => void;
  onUpdate: () => void;
  onCancelDownload: () => void;
  onOpenInstallPage: () => void;
  onOpenUnknownSourcesSettings: () => void;
}

export function UpdateSettingsCard() {
  const updates = useOptionalAndroidUpdates();
  if (!updates?.supported) return null;
  return (
    <View className="gap-3">
      <UpdateSettingsCardView
        supported={updates.supported}
        status={updates.status}
        installed={updates.installed}
        latest={updates.latest}
        error={updates.error}
        progress={updates.progress}
        onCheck={() => void updates.check()}
        onUpdate={() => void updates.updateNow()}
        onCancelDownload={updates.cancelDownload}
        onOpenInstallPage={() => void updates.openInstallPage()}
        onOpenUnknownSourcesSettings={() => void updates.openUnknownSourcesSettings()}
      />
      {__DEV__ ? <UpdateDownloadBenchmarkCard /> : null}
    </View>
  );
}

export function UpdateSettingsCardView(props: UpdateSettingsCardViewProps) {
  const theme = useZoptionTheme();
  if (!props.supported) return null;

  const versionLabel = props.installed
    ? `${props.installed.versionName} (${props.installed.versionCode})`
    : "Unknown";

  return (
    <Card accessibilityLabel="Zoption updates">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>About Zoption</Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Installed version {versionLabel}
        </Text>
        <StatusCopy {...props} />
        <Actions {...props} />
      </View>
    </Card>
  );
}

function StatusCopy(props: UpdateSettingsCardViewProps) {
  const theme = useZoptionTheme();
  const color =
    props.status === "failed" || props.status === "error"
      ? theme.colors.danger
      : theme.colors.textMuted;
  const message = statusMessage(props);
  if (!message) return null;
  return (
    <View className="gap-2">
      {props.status === "checking" ||
      props.status === "downloading" ||
      props.status === "verifying" ? (
        <ActivityIndicator accessibilityLabel={message} color={theme.colors.brand} />
      ) : null}
      <Text accessibilityLiveRegion="polite" style={[typography.body, { color }]}>
        {message}
      </Text>
      {props.status === "downloading" && props.progress ? (
        <ProgressBar
          bytesWritten={props.progress.bytesWritten}
          totalBytes={props.progress.totalBytes}
        />
      ) : null}
    </View>
  );
}

function Actions(props: UpdateSettingsCardViewProps) {
  if (props.status === "checking") {
    return (
      <Button disabled loading>
        Checking…
      </Button>
    );
  }
  if (props.status === "downloading") {
    return (
      <Button variant="secondary" onPress={props.onCancelDownload}>
        Cancel download
      </Button>
    );
  }
  if (props.status === "verifying" || props.status === "installing") {
    return (
      <Button disabled loading>
        {props.status === "verifying" ? "Verifying…" : "Opening installer…"}
      </Button>
    );
  }
  if (props.status === "available" && props.latest) {
    return (
      <Button
        onPress={props.onUpdate}
        accessibilityHint="Downloads and verifies the Android update"
      >
        Update now
      </Button>
    );
  }
  if (props.status === "reinstallRequired") {
    return (
      <Button
        onPress={props.onOpenInstallPage}
        accessibilityHint="Opens the official Zoption install page"
      >
        Open install page
      </Button>
    );
  }
  if (props.status === "needsPermission") {
    return (
      <Button
        onPress={props.onOpenUnknownSourcesSettings}
        accessibilityHint="Opens Android settings so Zoption can install the verified update"
      >
        Allow installs
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      onPress={props.onCheck}
      accessibilityHint="Checks for a newer official Android Beta"
    >
      Check for updates
    </Button>
  );
}

function ProgressBar({ bytesWritten, totalBytes }: DownloadProgress) {
  const theme = useZoptionTheme();
  const percent =
    totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((bytesWritten / totalBytes) * 100))) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: theme.colors.canvasMuted }]}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.colors.brand }]} />
    </View>
  );
}

function statusMessage(props: UpdateSettingsCardViewProps): string | null {
  switch (props.status) {
    case "idle":
      return null;
    case "checking":
      return "Checking…";
    case "current":
      return "Zoption is up to date";
    case "available":
      return props.installed && props.latest
        ? updateAvailableMessage(props.installed, props.latest)
        : "Update available";
    case "reinstallRequired":
      return props.latest
        ? reinstallRequiredMessage(props.latest)
        : "This version needs a fresh install.";
    case "error":
    case "failed":
      return props.error ?? "Unable to check for updates";
    case "downloading":
      return props.progress
        ? formatDownloadProgress(props.progress.bytesWritten, props.progress.totalBytes)
        : "Downloading update…";
    case "verifying":
      return "Verifying the update…";
    case "needsPermission":
      return "Allow Zoption to install updates in Android settings, then return here.";
    case "installing":
      return "Confirm the update in Android when prompted.";
  }
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%" },
});
