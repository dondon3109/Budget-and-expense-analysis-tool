import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useZoptionTheme } from "./theme-provider";
import { spacing, typography } from "./tokens";

interface ScreenProps extends PropsWithChildren {
  title: string;
  description?: string;
  action?: ReactNode;
  scroll?: boolean;
}

export function Screen({ title, description, action, scroll = true, children }: ScreenProps) {
  const theme = useZoptionTheme();
  const body = (
    <View className="w-full gap-6 px-4 pb-8 pt-3" style={[styles.content, !scroll && styles.fill]}>
      <View className="flex-row items-start justify-between gap-4">
        <View className="gap-1" style={styles.titleBlock}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[typography.display, { color: theme.colors.text }]}
          >
            {title}
          </Text>
          {description ? (
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {description}
            </Text>
          ) : null}
        </View>
        <View style={styles.actionBlock}>{action}</View>
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { maxWidth: 760, gap: spacing.lg },
  fill: { flex: 1, alignSelf: "center" },
  // The title keeps its width on a single line; the action (sync status,
  // add button) is the one allowed to compress when the row is tight.
  titleBlock: { flexGrow: 1, flexShrink: 0, minWidth: 0 },
  actionBlock: { flexShrink: 1, minWidth: 0 },
});
