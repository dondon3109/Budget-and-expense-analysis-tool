import type { PropsWithChildren } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

interface BottomSheetProps extends PropsWithChildren {
  visible: boolean;
  title: string;
  onDismiss: () => void;
}

export function BottomSheet({ visible, title, onDismiss, children }: BottomSheetProps) {
  const theme = useZoptionTheme();
  return (
    <Modal
      animationType={Platform.OS === "ios" ? "slide" : "fade"}
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          accessibilityLabel="Close sheet"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, elevation.dialog, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>
          <View className="flex-row items-center justify-between gap-4">
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: theme.colors.text }]}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onDismiss}
              style={styles.close}
            >
              <Text style={[typography.label, { color: theme.colors.brand }]}>Done</Text>
            </Pressable>
          </View>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={styles.scroll}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: "flex-end" },
  handleWrap: {
    alignItems: "center",
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radii.round,
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  scroll: {
    // Shrink to the sheet's maxHeight so long content scrolls instead of
    // overflowing off-screen.
    flexShrink: 1,
  },
  content: {
    paddingBottom: spacing.md,
  },
  close: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});
