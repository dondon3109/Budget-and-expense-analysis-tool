import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useReduceMotion } from "@/ui/reduce-motion";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";

import type { TransactionFormKind } from "./transaction-form";

type EntryMode = "manual" | "voice";

const KINDS: readonly {
  kind: TransactionFormKind;
  label: string;
  hint: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { kind: "expense", label: "Expense", hint: "Money you spent", icon: "arrow-up-right" },
  { kind: "income", label: "Income", hint: "Money you received", icon: "arrow-down-left" },
  { kind: "transfer", label: "Transfer", hint: "Move between accounts", icon: "swap-horizontal" },
];

const SHEET_TRAVEL = 360;
const CLOSE_MS = 160;

/**
 * The Add button's first step: a bottom sheet that springs up over a fading scrim, staggers in the
 * three type cards, and hands the choice to the editor (`kind`, plus `mode=voice` to start
 * listening on arrival). Mounted as a transparent modal route, so it animates itself.
 */
export function AddTransactionSheet() {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const [mode, setMode] = useState<EntryMode>("manual");
  const [pillWidth, setPillWidth] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const sheet = useRef(new Animated.Value(0)).current;
  const cards = useRef(KINDS.map(() => new Animated.Value(0))).current;
  const thumb = useRef(new Animated.Value(0)).current;
  const picked = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion === undefined) return;
    if (reduceMotion) {
      sheet.setValue(1);
      cards.forEach((card) => card.setValue(1));
      return;
    }
    Animated.parallel([
      Animated.spring(sheet, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.stagger(
        70,
        cards.map((card) =>
          Animated.spring(card, {
            toValue: 1,
            damping: 14,
            stiffness: 200,
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  }, [reduceMotion, sheet, cards]);

  useEffect(() => {
    Animated.spring(thumb, {
      toValue: mode === "manual" ? 0 : 1,
      damping: 20,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [mode, thumb]);

  // Slides the sheet away, then runs `after` once it is gone.
  const close = (after: () => void) => {
    if (leaving) return;
    setLeaving(true);
    if (reduceMotion) {
      after();
      return;
    }
    Animated.timing(sheet, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(after);
  };

  const choose = (kind: TransactionFormKind) => {
    if (leaving) return;
    // A quick squeeze on the chosen card before the sheet drops away.
    Animated.sequence([
      Animated.timing(picked, { toValue: 0.94, duration: 70, useNativeDriver: true }),
      Animated.spring(picked, { toValue: 1, damping: 12, stiffness: 300, useNativeDriver: true }),
    ]).start();
    close(() =>
      router.replace({
        pathname: "/(app)/transaction",
        params: mode === "voice" ? { kind, mode } : { kind },
      }),
    );
  };

  const kindColor = (kind: TransactionFormKind): ColorValue =>
    kind === "expense"
      ? theme.colors.expense
      : kind === "income"
        ? theme.colors.income
        : theme.colors.info;

  const thumbWidth = Math.max(0, (pillWidth - spacing.xxs * 2) / 2);

  return (
    <View style={styles.layer}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay, opacity: sheet }]}
      >
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={() => close(() => router.back())}
        />
      </Animated.View>
      <Animated.View
        style={{
          transform: [
            {
              translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [SHEET_TRAVEL, 0] }),
            },
          ],
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, elevation.dialog, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>
          <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
            Add transaction
          </Text>

          <View
            accessibilityRole="radiogroup"
            onLayout={(event) => setPillWidth(event.nativeEvent.layout.width)}
            style={[styles.pill, { backgroundColor: theme.colors.canvasMuted }]}
          >
            <Animated.View
              style={[
                styles.thumb,
                {
                  width: thumbWidth,
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                  transform: [
                    {
                      translateX: thumb.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, thumbWidth],
                      }),
                    },
                  ],
                },
              ]}
            />
            {(["manual", "voice"] as const).map((option) => {
              const selected = mode === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={option === "manual" ? "Manual entry" : "Voice entry"}
                  accessibilityState={{ checked: selected }}
                  onPress={withTapSound(() => setMode(option))}
                  style={styles.pillOption}
                >
                  <MaterialCommunityIcons
                    accessibilityElementsHidden
                    color={selected ? theme.colors.brand : theme.colors.textMuted}
                    name={option === "manual" ? "pencil-outline" : "microphone-outline"}
                    size={18}
                  />
                  <Text
                    style={[
                      typography.label,
                      { color: selected ? theme.colors.text : theme.colors.textMuted },
                    ]}
                  >
                    {option === "manual" ? "Manual" : "Voice"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.cards}>
            {KINDS.map(({ kind, label, hint, icon }, index) => {
              const card = cards[index];
              if (!card) return null;
              return (
                <Animated.View
                  key={kind}
                  style={{
                    opacity: card,
                    transform: [
                      {
                        translateY: card.interpolate({
                          inputRange: [0, 1],
                          outputRange: [24, 0],
                        }),
                      },
                      { scale: picked },
                    ],
                  }}
                >
                  <Pressable
                    accessibilityLabel={label}
                    accessibilityHint={hint}
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
                    onPress={withTapSound(() => choose(kind))}
                    style={[
                      styles.card,
                      { backgroundColor: theme.colors.canvas, borderColor: theme.colors.border },
                    ]}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: theme.colors.canvasMuted }]}>
                      <MaterialCommunityIcons
                        accessibilityElementsHidden
                        color={kindColor(kind)}
                        name={icon}
                        size={24}
                      />
                    </View>
                    <View style={styles.cardText}>
                      <Text style={[typography.headline, { color: theme.colors.text }]}>
                        {label}
                      </Text>
                      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                        {hint}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      accessibilityElementsHidden
                      color={theme.colors.textMuted}
                      name="chevron-right"
                      size={22}
                    />
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: "flex-end" },
  handleWrap: { alignItems: "center", paddingBottom: spacing.xxs },
  handle: { width: 36, height: 4, borderRadius: radii.round },
  sheet: {
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  pill: {
    flexDirection: "row",
    borderRadius: radii.round,
    padding: spacing.xxs,
  },
  thumb: {
    position: "absolute",
    top: spacing.xxs,
    bottom: spacing.xxs,
    left: spacing.xxs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  pillOption: {
    flex: 1,
    minHeight: touchTarget - spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  cards: { gap: spacing.sm },
  card: {
    minHeight: touchTarget + spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1 },
});
