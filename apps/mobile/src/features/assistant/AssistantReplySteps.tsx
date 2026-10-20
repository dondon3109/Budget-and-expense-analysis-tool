import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AssistantWireMessage } from "@/api/assistant";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface AssistantReplyStep {
  label: string;
  detail?: string;
  icon: IconName;
}

const SOURCE_ICONS: Record<string, IconName> = {
  transactions: "swap-horizontal",
  categories: "shape-outline",
  budgets: "chart-donut",
  accounts: "bank-outline",
  goals: "flag-outline",
  debts: "credit-card-outline",
  subscriptions: "repeat",
};

// A reply that took longer than this was not one live turn (a retried or imported row),
// so its gap says nothing about how long the assistant worked.
const MAX_THOUGHT_SECONDS = 600;

/** The records a reply read, from the `sources` the Worker stores in its metadata. */
export function replySteps(message: AssistantWireMessage): AssistantReplyStep[] {
  const metadata = message.metadata as { sources?: unknown } | undefined;
  if (!Array.isArray(metadata?.sources)) return [];
  const steps: AssistantReplyStep[] = [];
  for (const source of metadata.sources as Array<Record<string, unknown> | null>) {
    if (typeof source?.label !== "string") continue;
    const period = source.period as { label?: unknown } | undefined;
    const parts = [
      typeof period?.label === "string" ? period.label : null,
      typeof source.recordCount === "number"
        ? source.recordCount + (source.recordCount === 1 ? " record" : " records")
        : null,
    ].filter((part): part is string => part !== null);
    steps.push({
      label: source.label,
      ...(parts.length > 0 ? { detail: parts.join(" · ") } : {}),
      icon: SOURCE_ICONS[String(source.sourceType)] ?? "file-document-outline",
    });
  }
  return steps;
}

/**
 * Seconds each assistant reply took, keyed by its id. The Worker stamps the question when the
 * turn starts and the reply when it finishes, so the gap between them is the time it worked.
 */
export function replyThoughtSeconds(
  messages: readonly AssistantWireMessage[],
): Map<string, number> {
  const seconds = new Map<string, number>();
  let askedAt: number | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      askedAt = Date.parse(message.createdAt);
      continue;
    }
    if (askedAt === null) continue;
    const elapsed = (Date.parse(message.createdAt) - askedAt) / 1000;
    if (elapsed >= 0 && elapsed <= MAX_THOUGHT_SECONDS) {
      seconds.set(message.id, Math.max(1, Math.round(elapsed)));
    }
    askedAt = null;
  }
  return seconds;
}

/** "Thought for N seconds" over a reply, opening to the records it checked as a timeline. */
export function AssistantReplySteps({
  steps,
  thoughtSeconds,
  defaultExpanded = false,
}: {
  steps: readonly AssistantReplyStep[];
  thoughtSeconds?: number;
  defaultExpanded?: boolean;
}) {
  const theme = useZoptionTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (steps.length === 0 && thoughtSeconds === undefined) return null;

  const summary =
    thoughtSeconds !== undefined
      ? "Thought for " + thoughtSeconds + (thoughtSeconds === 1 ? " second." : " seconds.")
      : "Checked " + steps.length + (steps.length === 1 ? " source" : " sources");
  const header = (
    <>
      <Text style={[typography.body, styles.summary, { color: theme.colors.textMuted }]}>
        {summary}
      </Text>
      {steps.length > 0 ? (
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.colors.textMuted}
        />
      ) : null}
    </>
  );

  return (
    <View style={styles.wrap}>
      {steps.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityHint={expanded ? "Hides the records checked" : "Shows the records checked"}
          onPress={withTapSound(() => setExpanded((current) => !current))}
          hitSlop={8}
          style={styles.header}
        >
          {header}
        </Pressable>
      ) : (
        <View style={styles.header}>{header}</View>
      )}
      {expanded
        ? steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <View style={styles.rail}>
                <MaterialCommunityIcons name={step.icon} size={18} color={theme.colors.textMuted} />
                {index < steps.length - 1 ? (
                  <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
                ) : null}
              </View>
              <View style={styles.stepText}>
                <Text style={[typography.body, { color: theme.colors.text }]}>{step.label}</Text>
                {step.detail ? (
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    {step.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 28 },
  summary: { flex: 1 },
  step: { flexDirection: "row", gap: spacing.sm },
  rail: { width: 20, alignItems: "center", paddingTop: 2 },
  line: { width: StyleSheet.hairlineWidth * 2, flex: 1, minHeight: spacing.sm, marginTop: 4 },
  stepText: { flex: 1, gap: 2, paddingBottom: spacing.sm },
});
