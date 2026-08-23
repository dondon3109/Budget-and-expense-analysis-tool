import { useState } from "react";
import { Text, View } from "react-native";

import { telemetry, telemetryConfig } from "@/telemetry/telemetry";
import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export function DevTelemetryCard() {
  const theme = useZoptionTheme();
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState<boolean | null>(null);

  const handleSendTestCrash = async () => {
    setBusy(true);
    setResultMessage(null);
    setResultOk(null);

    try {
      if (!telemetryConfig.enabled) {
        setResultMessage(
          "Telemetry is disabled in this build. EXPO_PUBLIC_POSTHOG_KEY is not configured or telemetry is hard-disabled.",
        );
        setResultOk(false);
        return;
      }

      const sent = await telemetry.sendTestCrash("developer-test-action");
      if (sent) {
        setResultMessage(
          "Test crash event emitted and flushed successfully. Check PostHog for event 'mobile_crash' with source 'developer-test-action' and type 'CustomError'.",
        );
        setResultOk(true);
      } else {
        setResultMessage("Failed to send test crash event. Telemetry configuration is not enabled.");
        setResultOk(false);
      }
    } catch (error) {
      setResultMessage(
        error instanceof Error ? error.message : "An unexpected error occurred while sending test crash.",
      );
      setResultOk(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card accessibilityLabel="Telemetry diagnostics (dev only)">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          Crash telemetry (dev only)
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Triggers a sanitized diagnostic test event through the mobile crash pipeline without crashing the app.
        </Text>
        <View className="gap-1">
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Build key configured: {telemetryConfig.enabled ? "Yes" : "No (inert)"}
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            PostHog Host: {telemetryConfig.host}
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Kill switch flag: crash-telemetry-enabled
          </Text>
        </View>

        {resultMessage ? (
          <Text
            accessibilityRole="alert"
            style={[
              typography.body,
              { color: resultOk ? theme.colors.income : theme.colors.danger },
            ]}
          >
            {resultMessage}
          </Text>
        ) : null}

        <Button
          accessibilityHint="Sends a sanitized test crash report to PostHog"
          disabled={busy}
          loading={busy}
          variant="secondary"
          onPress={() => void handleSendTestCrash()}
        >
          Send test crash event
        </Button>
      </View>
    </Card>
  );
}
