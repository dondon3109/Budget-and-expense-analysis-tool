import { ActivityIndicator, Text, View } from "react-native";

import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { useOptionalOtaUpdates, type OtaUpdateStatus } from "./use-ota-updates";

export interface OtaUpdateSettingsCardViewProps {
  supported: boolean;
  status: OtaUpdateStatus;
  error: string | null;
  onCheck: () => void;
  onRestart: () => void;
}

export function OtaUpdateSettingsCard() {
  const updates = useOptionalOtaUpdates();
  if (!updates?.supported) return null;
  return (
    <OtaUpdateSettingsCardView
      supported={updates.supported}
      status={updates.status}
      error={updates.error}
      onCheck={() => void updates.check()}
      onRestart={() => void updates.restart()}
    />
  );
}

export function OtaUpdateSettingsCardView(props: OtaUpdateSettingsCardViewProps) {
  const theme = useZoptionTheme();
  if (!props.supported) return null;

  const message = statusMessage(props.status, props.error);
  const busy =
    props.status === "checking" || props.status === "downloading" || props.status === "restarting";

  return (
    <Card accessibilityLabel="Quick app updates">
      <View className="gap-3">
        <View className="gap-1">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Quick updates</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Small fixes can download without another APK. Native changes still use the verified APK
            updater below.
          </Text>
        </View>
        <View className="gap-2">
          {busy ? (
            <ActivityIndicator accessibilityLabel={message} color={theme.colors.brand} />
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={props.status === "error" ? "alert" : undefined}
            style={[
              typography.body,
              { color: props.status === "error" ? theme.colors.danger : theme.colors.textMuted },
            ]}
          >
            {message}
          </Text>
        </View>
        {props.status === "ready" ? (
          <Button
            accessibilityHint="Restarts Zoption and applies the downloaded quick update"
            onPress={props.onRestart}
          >
            Restart and apply
          </Button>
        ) : (
          <Button
            accessibilityHint="Checks for compatible JavaScript and asset fixes"
            disabled={busy}
            loading={busy}
            variant="secondary"
            onPress={props.onCheck}
          >
            {busy ? busyLabel(props.status) : "Check for quick fixes"}
          </Button>
        )}
      </View>
    </Card>
  );
}

function statusMessage(status: OtaUpdateStatus, error: string | null): string {
  switch (status) {
    case "idle":
      return "Quick fixes are checked quietly when Zoption opens.";
    case "checking":
      return "Checking for a compatible quick update…";
    case "downloading":
      return "Downloading a compatible quick update…";
    case "current":
      return "Quick fixes are up to date.";
    case "ready":
      return "A quick update is ready. Restart when convenient to apply it.";
    case "error":
      return error ?? "Zoption could not check for a quick update.";
    case "restarting":
      return "Restarting Zoption…";
  }
}

function busyLabel(status: OtaUpdateStatus): string {
  if (status === "downloading") return "Downloading…";
  if (status === "restarting") return "Restarting…";
  return "Checking…";
}
