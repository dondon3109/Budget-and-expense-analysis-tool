import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocalWorkspace, useReferenceConflict } from "@/db/local-workspace-state";
import type { LocalReferenceConflictVersion } from "@/db/transaction-mutation-repository";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, ConfirmationDialog, ErrorState, Skeleton } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function VersionCard({
  title,
  value,
  missing,
}: {
  title: string;
  value: LocalReferenceConflictVersion | null;
  missing: string;
}) {
  const theme = useZoptionTheme();
  return (
    <Card accessibilityLabel={`${title}, ${value ? value.name : missing}`}>
      <Text style={[typography.label, { color: theme.colors.textMuted }]}>{title}</Text>
      {value ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            {value.color ? (
              <View
                accessibilityElementsHidden
                style={[styles.color, { backgroundColor: value.color }]}
              />
            ) : null}
            <Text style={[typography.title, { color: theme.colors.text }]}>{value.name}</Text>
          </View>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            {value.detail}
            {value.color ? ` · ${value.color}` : ""}
          </Text>
          {value.archived ? (
            <Text style={[typography.caption, { color: theme.colors.warning }]}>Archived</Text>
          ) : null}
        </View>
      ) : (
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>{missing}</Text>
      )}
    </Card>
  );
}

export function ReferenceConflictScreen() {
  const params = useLocalSearchParams<{
    entityType?: string | string[];
    id?: string | string[];
  }>();
  const rawType = single(params.entityType);
  const entityType = rawType === "account" || rawType === "category" ? rawType : undefined;
  const id = single(params.id);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const state = useReferenceConflict(entityType, id);
  const theme = useZoptionTheme();
  const [choice, setChoice] = useState<"keep_local" | "keep_server" | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const label = entityType ?? "item";

  const resolve = async (): Promise<void> => {
    if (!choice || !entityType || !id || !local.workspace || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.resolveReferenceConflict(entityType, id, choice);
      setChoice(null);
      router.back();
      sync.retry();
    } catch (error) {
      setChoice(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The conflict could not be resolved in encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!entityType || !id || state.error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title: "Resolve conflict" }} />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Conflict unavailable"
            message={state.error ?? "This conflict route is invalid."}
            onRetry={state.error ? state.retry : undefined}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title: "Resolve conflict" }} />
        <View className="gap-3 px-4 pt-6">
          <Skeleton height={132} />
          <Skeleton height={132} />
        </View>
      </SafeAreaView>
    );
  }

  if (!state.conflict) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title: "Resolve conflict" }} />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Conflict already resolved"
            message="Return to Money setup to see the current synchronized item."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: `Resolve ${label} conflict` }} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
          Choose which version to keep
        </Text>
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          Zoption never uses the device clock to overwrite this change. Keeping this device creates
          a new operation against server revision {state.conflict.serverRevision}.
        </Text>
        <VersionCard title="On this device" value={state.conflict.local} missing="Unavailable" />
        <VersionCard
          title="On the server"
          value={state.conflict.server}
          missing={`This ${label} no longer exists on the server.`}
        />
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.danger }]}
          >
            {message}
          </Text>
        ) : null}
        <View className="gap-3">
          <Button
            loading={saving && choice === "keep_server"}
            onPress={() => setChoice("keep_server")}
          >
            Keep server version
          </Button>
          <Button disabled={saving} variant="secondary" onPress={() => setChoice("keep_local")}>
            Keep this device
          </Button>
        </View>
        <ConfirmationDialog
          visible={choice !== null}
          title={
            choice === "keep_local" ? "Keep this device’s version?" : "Keep the server version?"
          }
          message={
            choice === "keep_local"
              ? "Zoption will retry this saved version against the latest preserved server revision. A newer server edit will ask again."
              : "The server version will replace this device’s conflicting copy."
          }
          confirmLabel={choice === "keep_local" ? "Keep this device" : "Keep server"}
          onCancel={() => setChoice(null)}
          onConfirm={() => void resolve()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  color: { width: 16, height: 16, borderRadius: radii.round },
});
