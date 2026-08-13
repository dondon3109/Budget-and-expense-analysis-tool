import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useLocalWorkspace,
  useTransactionConflict,
  useTransactionFormData,
} from "@/db/local-workspace-state";
import type { LocalTransactionConflictVersion } from "@/db/transaction-mutation-repository";
import { useSyncState } from "@/sync/sync-state";
import { formatMinorForInput } from "./transaction-form";
import {
  Button,
  Card,
  ConfirmationDialog,
  ErrorState,
  MoneyValue,
  Skeleton,
} from "@/ui/components";
import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function VersionCard({
  title,
  version,
  accountName,
  destinationAccountName,
  categoryName,
}: {
  title: string;
  version: LocalTransactionConflictVersion | null;
  accountName?: string;
  destinationAccountName?: string;
  categoryName?: string;
}) {
  const theme = useZoptionTheme();
  const transfer = version?.input.kind === "transfer" ? version.input : null;
  return (
    <Card accessibilityLabel={title}>
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {title}
      </Text>
      {!version || version.deleted ? (
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Deleted</Text>
      ) : (
        <>
          <View className="flex-row items-start justify-between gap-3">
            <Text style={[typography.body, styles.description, { color: theme.colors.text }]}>
              {version.input.description}
            </Text>
            <MoneyValue
              amountMinor={
                version.input.kind === "expense"
                  ? -version.input.amountMinor
                  : version.input.amountMinor
              }
              currency={version.input.currency}
              style={typography.headline}
              tone={version.input.kind === "transfer" ? "default" : version.input.kind}
            />
          </View>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {version.input.date} · {categoryName ?? version.input.categoryId}
          </Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {transfer
              ? `${accountName ?? transfer.fromAccountId} → ${destinationAccountName ?? transfer.toAccountId}`
              : (accountName ?? ("accountId" in version.input ? version.input.accountId : ""))}
          </Text>
          {transfer && (transfer.transferFeeMinor ?? 0) > 0 ? (
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Fee: {formatMinorForInput(transfer.transferFeeMinor ?? 0)} {transfer.currency}
            </Text>
          ) : null}
          {version.input.notes ? (
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {version.input.notes}
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function TransactionConflictScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = singleParam(params.id);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const state = useTransactionConflict(id);
  const choices = useTransactionFormData(id);
  const theme = useZoptionTheme();
  const [choice, setChoice] = useState<"keep_local" | "keep_server" | null>(null);
  const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolve = async (): Promise<void> => {
    if (!choice || !id || !local.workspace || resolving) return;
    setResolving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.resolveConflict(id, choice);
      setChoice(null);
      router.dismissTo("/transactions");
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The preserved conflict could not be resolved safely.",
      );
      setChoice(null);
    } finally {
      setResolving(false);
    }
  };

  const findAccount = (accountId: string): string | undefined =>
    choices.data?.accounts.find((account) => account.id === accountId)?.name;
  const findCategory = (categoryId: string): string | undefined =>
    choices.data?.categories.find((category) => category.id === categoryId)?.name;

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: "Review conflict" }} />
      {state.error ? (
        <View className="flex-1 justify-center px-4">
          <ErrorState title="Conflict unavailable" message={state.error} onRetry={state.retry} />
        </View>
      ) : state.loading ? (
        <View accessibilityLabel="Loading conflict" className="gap-4 px-4 pt-6">
          <Skeleton height={168} />
          <Skeleton height={168} />
        </View>
      ) : !state.conflict ? (
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Conflict already resolved"
            message="There is no unresolved conflict for this transaction."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: theme.colors.text }]}
            >
              Choose the version to keep
            </Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Zoption preserved both versions. No device timestamp decides this choice.
            </Text>
          </View>
          <VersionCard
            title="On this device"
            version={state.conflict.local}
            accountName={findAccount(
              state.conflict.local.input.kind === "transfer"
                ? state.conflict.local.input.fromAccountId
                : state.conflict.local.input.accountId,
            )}
            destinationAccountName={
              state.conflict.local.input.kind === "transfer"
                ? findAccount(state.conflict.local.input.toAccountId)
                : undefined
            }
            categoryName={findCategory(state.conflict.local.input.categoryId)}
          />
          <VersionCard
            title="On the server"
            version={state.conflict.server}
            accountName={
              state.conflict.server
                ? findAccount(
                    state.conflict.server.input.kind === "transfer"
                      ? state.conflict.server.input.fromAccountId
                      : state.conflict.server.input.accountId,
                  )
                : undefined
            }
            destinationAccountName={
              state.conflict.server?.input.kind === "transfer"
                ? findAccount(state.conflict.server.input.toAccountId)
                : undefined
            }
            categoryName={
              state.conflict.server
                ? findCategory(state.conflict.server.input.categoryId)
                : undefined
            }
          />
          {message ? (
            <Text
              accessibilityRole="alert"
              style={[typography.callout, { color: theme.colors.danger }]}
            >
              {message}
            </Text>
          ) : null}
          <Button disabled={resolving} onPress={() => setChoice("keep_local")}>
            Keep this device version
          </Button>
          <Button disabled={resolving} onPress={() => setChoice("keep_server")} variant="secondary">
            Use server version
          </Button>
        </ScrollView>
      )}
      <ConfirmationDialog
        confirmLabel={choice === "keep_local" ? "Keep mine" : "Use server"}
        message={
          choice === "keep_local"
            ? "Zoption will create a new operation based on the latest server revision. It may conflict again if the server changes first."
            : "Zoption will discard this device's proposed change and replace it with the preserved server version."
        }
        onCancel={() => setChoice(null)}
        onConfirm={() => void resolve()}
        title={choice === "keep_local" ? "Keep this device version?" : "Use server version?"}
        visible={choice !== null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  description: { minWidth: 0, flex: 1 },
});
