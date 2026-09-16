import {
  useCallback,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useZoptionTheme } from "./theme-provider";
import { spacing, typography } from "./tokens";

export interface ScreenProps extends PropsWithChildren {
  title: string;
  description?: string;
  action?: ReactNode;
  scroll?: boolean;
  showHeading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  refreshControl?: ReactElement;
  hasHeader?: boolean;
  edges?: readonly Edge[];
  overlay?: ReactNode;
}

export function Screen({
  title,
  description,
  action,
  scroll = true,
  showHeading = true,
  refreshing,
  onRefresh,
  refreshControl: customRefreshControl,
  hasHeader = false,
  edges,
  overlay,
  children,
}: ScreenProps) {
  const theme = useZoptionTheme();
  const [internalRefreshing, setInternalRefreshing] = useState(false);

  const resolvedEdges =
    edges ?? (hasHeader ? (["bottom", "left", "right"] as const) : (["top", "left", "right"] as const));

  const shouldRenderHeading = showHeading && (!hasHeader || Boolean(description || action));

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setInternalRefreshing(true);
    try {
      const result = onRefresh();
      if (result instanceof Promise) {
        await result;
      }
    } finally {
      setInternalRefreshing(false);
    }
  }, [onRefresh]);

  const isRefreshing =
    refreshing !== undefined ? Boolean(refreshing || internalRefreshing) : internalRefreshing;

  const resolvedRefreshControl =
    customRefreshControl ??
    (onRefresh ? (
      <RefreshControl
        testID="screen-refresh-control"
        colors={[String(theme.colors.brand)]}
        onRefresh={handleRefresh}
        progressBackgroundColor={String(theme.colors.surfaceRaised)}
        refreshing={isRefreshing}
        tintColor={String(theme.colors.brand)}
      />
    ) : undefined);
  const body = (
    <View className="w-full gap-6 px-4 pb-8 pt-3" style={[styles.content, !scroll && styles.fill]}>
      {shouldRenderHeading ? (
        <View
          style={[
            styles.headingRow,
            description ? styles.headingRowWithDescription : styles.headingRowCentered,
          ]}
        >
          {!hasHeader || description ? (
            <View className="gap-1" style={styles.titleBlock}>
              {!hasHeader ? (
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={[typography.display, { color: theme.colors.text }]}
                >
                  {title}
                </Text>
              ) : null}
              {description ? (
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                  {description}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.titleBlock} />
          )}
          {action ? <View style={styles.actionBlock}>{action}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={resolvedEdges}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      {scroll ? (
        <ScrollView
          alwaysBounceVertical={Boolean(resolvedRefreshControl)}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          refreshControl={resolvedRefreshControl}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center" },
  content: { maxWidth: 760, gap: spacing.lg },
  fill: { flex: 1, alignSelf: "center" },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headingRowCentered: {
    alignItems: "center",
  },
  headingRowWithDescription: {
    alignItems: "flex-start",
  },
  // The title and description adapt to available width while preserving space
  // for the action controls on the right.
  titleBlock: { flex: 1, minWidth: 0 },
  actionBlock: { flexShrink: 0 },
});
