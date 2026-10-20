import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type GestureResponderEvent,
} from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { GrowPanel, measureGrowAnchor, type GrowAnchor } from "@/ui/components/GrowPanel";
import { useReduceMotion } from "@/ui/reduce-motion";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

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

/**
 * Opens the add picker growing out of the pressed control; a call without an event (a tutorial
 * action, a notification) grows it from the bottom of the screen.
 */
export function openAddTransaction(event?: GestureResponderEvent): void {
  measureGrowAnchor(event, (anchor) =>
    router.push(
      anchor
        ? {
            pathname: "/(app)/add-transaction",
            params: {
              x: String(Math.round(anchor.x)),
              y: String(Math.round(anchor.y)),
              top: String(Math.round(anchor.top)),
              bottom: String(Math.round(anchor.bottom)),
            },
          }
        : "/(app)/add-transaction",
    ),
  );
}

// Route params arrive as strings; a missing or malformed point means no anchor.
function anchorFromParams(params: { x?: string; y?: string; top?: string; bottom?: string }) {
  const x = Number(params.x);
  const y = Number(params.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const top = Number(params.top);
  const bottom = Number(params.bottom);
  const anchor: GrowAnchor = {
    x,
    y,
    top: Number.isFinite(top) ? top : y,
    bottom: Number.isFinite(bottom) ? bottom : y,
  };
  return anchor;
}

/**
 * The Add button's first step: a `GrowPanel` out of the Add button that staggers in the three
 * type cards and hands the choice to the editor (`kind`, plus `mode=voice` to start listening on
 * arrival). Mounted as a transparent modal route, so it animates itself.
 */
export function AddTransactionPicker() {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ x?: string; y?: string; top?: string; bottom?: string }>();
  const [mode, setMode] = useState<EntryMode>("manual");
  const [pillWidth, setPillWidth] = useState(0);
  const cards = useRef(KINDS.map(() => new Animated.Value(0))).current;
  const thumb = useRef(new Animated.Value(0)).current;
  const picked = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(thumb, {
      toValue: mode === "manual" ? 0 : 1,
      damping: 20,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [mode, thumb]);

  const kindColor = (kind: TransactionFormKind): ColorValue =>
    kind === "expense"
      ? theme.colors.expense
      : kind === "income"
        ? theme.colors.income
        : theme.colors.info;

  const thumbWidth = Math.max(0, (pillWidth - spacing.xxs * 2) / 2);

  return (
    <GrowPanel anchor={anchorFromParams(params)} onDismiss={() => router.back()}>
      {({ close, ready }) => (
        <>
          <CardStagger cards={cards} ready={ready} reduceMotion={reduceMotion} />
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
                  onPress={withTapSound(() => setMode(option), "select")}
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
                    onPress={withTapSound(() => {
                      // A quick squeeze on the chosen card before the panel shrinks away.
                      Animated.sequence([
                        Animated.timing(picked, {
                          toValue: 0.94,
                          duration: 70,
                          useNativeDriver: true,
                        }),
                        Animated.spring(picked, {
                          toValue: 1,
                          damping: 12,
                          stiffness: 300,
                          useNativeDriver: true,
                        }),
                      ]).start();
                      close(() =>
                        router.replace({
                          pathname: "/(app)/transaction",
                          params: mode === "voice" ? { kind, mode } : { kind },
                        }),
                      );
                    })}
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
        </>
      )}
    </GrowPanel>
  );
}

/** Springs the type cards in one after another once the panel starts growing. */
function CardStagger({
  cards,
  ready,
  reduceMotion,
}: {
  cards: Animated.Value[];
  ready: boolean;
  reduceMotion: boolean | undefined;
}) {
  useEffect(() => {
    if (!ready) return;
    if (reduceMotion) {
      cards.forEach((card) => card.setValue(1));
      return;
    }
    Animated.stagger(
      70,
      cards.map((card) =>
        Animated.spring(card, { toValue: 1, damping: 14, stiffness: 200, useNativeDriver: true }),
      ),
    ).start();
  }, [ready, reduceMotion, cards]);
  return null;
}

const styles = StyleSheet.create({
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
