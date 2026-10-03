import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { assistantTransactionDraftSchema } from "@zoption/shared";
import { confirmAssistantTransactionDraft, type AssistantWireMessage } from "@/api/assistant";
import { ApiTransportError } from "@/api/authenticated";
import { useSessionSnapshot } from "@/auth/session-state";
import { useSyncState } from "@/sync/sync-state";
import { Button } from "@/ui/components/Button";
import { MoneyValue } from "@/ui/components/MoneyValue";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { AssistantActionCard } from "./AssistantActionCard";
import { ASSISTANT_AVATAR_SIZE, AssistantMessageBubble } from "./assistant-ui";

function evidenceLabelFor(message: AssistantWireMessage): string | undefined {
  const metadata = message.metadata as
    { sources?: Array<{ label?: unknown; period?: { label?: unknown } }> } | undefined;
  const sources = Array.isArray(metadata?.sources) ? metadata.sources : [];
  const first = sources[0];
  if (!first || typeof first.label !== "string") return undefined;
  const period = typeof first.period?.label === "string" ? " · " + first.period.label : "";
  return "Grounded in " + first.label + period;
}

/** Replies whose draft a later correction replaced; those can no longer be saved. */
export function replacedDraftMessageIds(messages: readonly AssistantWireMessage[]): Set<string> {
  const replaced = new Set<string>();
  for (const message of messages) {
    const parsed = assistantTransactionDraftSchema.safeParse(message.metadata?.transactionDraft);
    if (parsed.success && parsed.data.replacesMessageId)
      replaced.add(parsed.data.replacesMessageId);
  }
  return replaced;
}

/** One chat message, plus the review card when an assistant reply drafted a transaction or change. */
export function AssistantMessageRow({
  message,
  superseded = false,
  latestActionId,
  onDraftSaved,
}: {
  message: AssistantWireMessage;
  /** A later correction replaced this draft, so saving it would record the purchase twice. */
  superseded?: boolean;
  /** The newest proposed subscription, goal, or debt change in the chat; only it can be confirmed. */
  latestActionId?: string;
  onDraftSaved: (saved: AssistantWireMessage) => void;
}) {
  return (
    <View>
      <AssistantMessageBubble
        role={message.role}
        content={message.content}
        status={message.status}
        createdAt={message.createdAt}
        evidenceLabel={evidenceLabelFor(message)}
      />
      {message.role === "assistant" ? (
        <>
          <AssistantDraftCard message={message} superseded={superseded} onSaved={onDraftSaved} />
          <AssistantActionCard
            message={message}
            superseded={latestActionId !== message.id}
            onDone={onDraftSaved}
          />
        </>
      ) : null}
    </View>
  );
}

function AssistantDraftCard({
  message,
  superseded,
  onSaved,
}: {
  message: AssistantWireMessage;
  superseded: boolean;
  onSaved: (saved: AssistantWireMessage) => void;
}) {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const sync = useSyncState();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = assistantTransactionDraftSchema.safeParse(message.metadata?.transactionDraft);
  if (!parsed.success) return null;
  const draft = parsed.data;
  // A stored "saving" state still offers Save: the server refuses a live claim and takes over
  // one a failed request left behind, so a tap can never record the purchase twice.
  const saved = draft.status === "saved";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const confirm = async (refresh: boolean) =>
        confirmAssistantTransactionDraft(
          { accessToken: await session.getAccessToken(refresh) },
          message.id,
        );
      const result = await confirm(false).catch((cause: unknown) => {
        if (cause instanceof ApiTransportError && cause.code === "session_expired") {
          return confirm(true);
        }
        throw cause;
      });
      onSaved(result);
      // The server wrote the row, so pull it into the local workspace now.
      sync.retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The transaction could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const rows: Array<[string, string]> = [
    ["Description", draft.description],
    ["Category", draft.categoryName],
    ["Account", draft.accountName],
    ["Date", draft.date],
  ];
  return (
    <View
      accessibilityLabel="Transaction draft"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderLeftColor: draft.kind === "income" ? theme.colors.income : theme.colors.expense,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {draft.kind === "income" ? "Income draft" : "Expense draft"}
        </Text>
        <MoneyValue
          amountMinor={draft.amountMinor}
          currency={draft.currency}
          tone={draft.kind === "income" ? "income" : "expense"}
        />
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
          <Text style={[typography.body, styles.value, { color: theme.colors.text }]}>{value}</Text>
        </View>
      ))}
      {saved ? (
        <Text style={[typography.body, { color: theme.colors.income }]}>
          Saved to your transactions
        </Text>
      ) : superseded ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Replaced by a newer draft below.
        </Text>
      ) : (
        <Button variant="primary" size="compact" loading={saving} onPress={() => void save()}>
          Save transaction
        </Button>
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    marginLeft: ASSISTANT_AVATAR_SIZE + spacing.xs,
    maxWidth: "86%",
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  value: { flexShrink: 1, textAlign: "right" },
});
