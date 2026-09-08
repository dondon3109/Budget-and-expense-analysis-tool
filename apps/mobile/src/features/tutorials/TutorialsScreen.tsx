import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

interface TutorialTopic {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  summary: string;
  actionTitle?: string;
  onAction?: () => void;
  steps: {
    title: string;
    description: string;
    tip?: string;
  }[];
}

export function TutorialsScreen() {
  const theme = useZoptionTheme();
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>("adjust-balance");

  const topics: TutorialTopic[] = [
    {
      id: "adjust-balance",
      icon: "tune-vertical",
      title: "How to Adjust Current Balances",
      summary:
        "Quickly sync your Zoption accounts with your real-world cash, bank, or e-wallet amounts without losing ledger history.",
      actionTitle: "Manage accounts & adjust",
      onAction: () => router.push("/(app)/money-setup"),
      steps: [
        {
          title: "1. Locate your Account",
          description:
            "From the Home tab, look at 'Total Balance' and tap on any account (Cash, Bank, GCash, etc.), or tap 'Accounts' in the top right.",
        },
        {
          title: "2. View 'Adjust current balance'",
          description:
            "Scroll down to the 'Adjust current balance' section inside the account editor. You'll see your current ledger balance.",
        },
        {
          title: "3. Enter your actual amount",
          description:
            "Type what you actually have in your pocket or bank. Zoption calculates the delta and shows whether it will be booked as income or expense.",
          tip: "A higher balance books an Income Adjustment. A lower balance books an Expense Adjustment under Uncategorized.",
        },
        {
          title: "4. Save or Undo",
          description:
            "Tap 'Adjust balance'. If you made a mistake or typo, tap 'Undo adjustment' immediately to reverse the change.",
        },
      ],
    },
    {
      id: "envelope-budgeting",
      icon: "chart-donut",
      title: "How to Use Envelope Budgeting",
      summary: "Assign every peso a job with category spending envelopes so you never overspend.",
      actionTitle: "Open Budgets",
      onAction: () => router.push("/(app)/(tabs)/budgets"),
      steps: [
        {
          title: "1. Go to the Budgets tab",
          description:
            "Tap 'Budgets' on the bottom navigation bar to view your monthly envelope allocations.",
        },
        {
          title: "2. Set category monthly targets",
          description:
            "Create envelopes for Groceries, Dining out, Bills, Transport, and Entertainment.",
        },
        {
          title: "3. Watch envelope meters update",
          description:
            "As you record expenses, the progress meter fills up. Green indicates you're safely under budget; red warns you of an overrun.",
        },
        {
          title: "4. Share with family",
          description:
            "Tap the share icon in the top header to generate an encrypted link for your spouse or household.",
        },
      ],
    },
    {
      id: "fast-entry",
      icon: "camera-outline",
      title: "Fast Expense Entry: Receipts & Voice",
      summary:
        "Log purchases on the go in under 5 seconds with receipt scanning and AI voice input.",
      actionTitle: "Record transaction",
      onAction: () => router.push("/(app)/transaction"),
      steps: [
        {
          title: "1. Camera Receipt Scanning",
          description:
            "Tap 'Scan' on the Home quick action bar. Point your camera at a receipt and Zoption automatically reads the total, merchant name, and date.",
        },
        {
          title: "2. AI Voice Assistant",
          description:
            "Tap 'Assistant' or the microphone to speak naturally: 'Paid 350 for gas from BPI' or 'Spent 180 on coffee with Cash'.",
        },
        {
          title: "3. Bank SMS Alerts",
          description:
            "Copy bank transaction SMS messages from GCash, Maya, BDO, or BPI and paste them directly into Zoption.",
        },
      ],
    },
    {
      id: "subscriptions",
      icon: "calendar-sync-outline",
      title: "Managing Recurring Subscriptions",
      summary:
        "Track billing cycles, upcoming renewal dates, and step-by-step cancellation instructions.",
      actionTitle: "View Subscriptions",
      onAction: () => router.push("/(app)/subscriptions"),
      steps: [
        {
          title: "1. Add monthly & annual subscriptions",
          description:
            "Track streaming services, cloud storage, gym memberships, and insurance premiums.",
        },
        {
          title: "2. Check renewal agenda on Calendar",
          description:
            "See upcoming charges marked on your calendar so you are never surprised by auto-renewals.",
        },
        {
          title: "3. Cancellation Guides",
          description:
            "Tap any subscription and select 'Cancellation guide' for direct links and instructions on how to cancel.",
        },
      ],
    },
    {
      id: "privacy-offline",
      icon: "shield-check-outline",
      title: "Offline Storage & Privacy",
      summary:
        "Learn how your financial records are protected by local encryption and offline-first design.",
      steps: [
        {
          title: "1. 100% Offline Functionality",
          description:
            "You can record transactions, adjust balances, and check budgets with zero internet connection.",
        },
        {
          title: "2. Encrypted Local SQLite",
          description:
            "All financial records are stored securely on your device with authenticated hardware-backed keys.",
        },
        {
          title: "3. Background Sync",
          description:
            "When internet is restored, changes sync seamlessly in the background with automated conflict resolution.",
        },
      ],
    },
  ];

  return (
    <Screen
      title="Tutorials & user guide"
      description="Practical walkthroughs to help you get the most out of Zoption."
    >
      <Stack.Screen options={{ title: "Tutorials & Guides" }} />

      <View style={{ gap: spacing.md }}>
        {topics.map((topic) => {
          const isExpanded = expandedTopicId === topic.id;
          return (
            <Card key={topic.id} accessibilityLabel={topic.title}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${topic.title}, ${isExpanded ? "collapse" : "expand"}`}
                onPress={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                style={styles.topicHeader}
              >
                <View
                  accessibilityElementsHidden
                  style={[styles.iconBox, { backgroundColor: theme.colors.brandSoft }]}
                >
                  <MaterialCommunityIcons name={topic.icon} size={22} color={theme.colors.brand} />
                </View>
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[typography.headline, { color: theme.colors.text }]}>
                    {topic.title}
                  </Text>
                  <Text
                    numberOfLines={isExpanded ? undefined : 2}
                    style={[typography.caption, { color: theme.colors.textMuted }]}
                  >
                    {topic.summary}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={22}
                  color={theme.colors.textMuted}
                />
              </Pressable>

              {isExpanded && (
                <View style={[styles.stepsContainer, { borderTopColor: theme.colors.border }]}>
                  {topic.steps.map((step, idx) => (
                    <View key={idx} style={styles.stepRow}>
                      <View style={{ flex: 1, gap: spacing.xxs }}>
                        <Text
                          style={[typography.headline, { color: theme.colors.text, fontSize: 14 }]}
                        >
                          {step.title}
                        </Text>
                        <Text
                          style={[
                            typography.body,
                            { color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 },
                          ]}
                        >
                          {step.description}
                        </Text>
                        {step.tip ? (
                          <View
                            style={[
                              styles.tipBox,
                              {
                                backgroundColor: theme.colors.canvasMuted,
                                borderColor: theme.colors.brand,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                typography.caption,
                                { color: theme.colors.brand, fontWeight: "600" },
                              ]}
                            >
                              Tip: {step.tip}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}

                  {topic.actionTitle && topic.onAction ? (
                    <View style={styles.actionRow}>
                      <Button variant="secondary" size="compact" onPress={topic.onAction}>
                        {topic.actionTitle}
                      </Button>
                    </View>
                  ) : null}
                </View>
              )}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  stepsContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  tipBox: {
    marginTop: spacing.xxs,
    padding: spacing.xs,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.xs,
  },
});
