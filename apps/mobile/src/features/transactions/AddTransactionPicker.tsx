import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

const CLOSE_MS = 180;
const GAP = 12;

/**
 * Opens the add picker growing out of the pressed control. The touch point is the scale origin and
 * the control's measured edges place the panel clear of it; a call without an event (a tutorial
 * action, a notification) grows it from the bottom of the screen.
 */
export function openAddTransaction(event?: GestureResponderEvent): void {
  const touch = event?.nativeEvent;
  if (!touch || !Number.isFinite(touch.pageX) || !Number.isFinite(touch.pageY)) {
    router.push("/(app)/add-transaction");
    return;
  }
  const { pageX, pageY } = touch;
  const open = (top: number, bottom: number) =>
    router.push({
      pathname: "/(app)/add-transaction",
      params: {
        x: String(Math.round(pageX)),
        y: String(Math.round(pageY)),
        top: String(Math.round(top)),
        bottom: String(Math.round(bottom)),
      },
    });
  const target = event.currentTarget as unknown as Partial<View> | null;
  if (typeof target?.measureInWindow !== "function") {
    open(pageY, pageY);
    return;
  }
  target.measureInWindow((_x, top, _width, height) => open(top, top + height));
}

/**
 * The Add button's first step: a panel that scales out of the Add button over a fading scrim,
 * staggers in the three type cards, and hands the choice to the editor (`kind`, plus
 * `mode=voice` to start listening on arrival). Choosing or dismissing shrinks it back into the
 * button. Mounted as a transparent modal route, so it animates itself.
 */
export function AddTransactionPicker() {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ x?: string; y?: string; top?: string; bottom?: string }>();
  const [mode, setMode] = useState<EntryMode>("manual");
  const [pillWidth, setPillWidth] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // The panel's laid-out top and height, needed to aim the scale at the origin.
  const [frame, setFrame] = useState<{ top: number; height: number } | null>(null);

  const originX = Number(params.x ?? Number.NaN);
  const originY = Number(params.y ?? Number.NaN);
  const hasOrigin = Number.isFinite(originX) && Number.isFinite(originY);
  const origin = hasOrigin
    ? { x: originX, y: originY }
    : { x: window.width / 2, y: window.height - insets.bottom };
  const controlTop = Number(params.top ?? origin.y);
  const controlBottom = Number(params.bottom ?? origin.y);
  // Open below a control in the top half of the screen, above one in the bottom half.
  const below = hasOrigin && origin.y < window.height / 2;
  const placement = below
    ? { top: Math.max(insets.top + GAP, controlBottom + GAP) }
    : { bottom: Math.max(insets.bottom + GAP, window.height - controlTop + GAP) };

  const sheet = useRef(new Animated.Value(0)).current;
  const cards = useRef(KINDS.map(() => new Animated.Value(0))).current;
  const thumb = useRef(new Animated.Value(0)).current;
  const picked = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion === undefined || !frame) return;
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
  }, [reduceMotion, frame, sheet, cards]);

  useEffect(() => {
    Animated.spring(thumb, {
      toValue: mode === "manual" ? 0 : 1,
      damping: 20,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [mode, thumb]);

  // Shrinks the panel back into its origin, then runs `after` once it is gone.
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
    // A quick squeeze on the chosen card before the panel shrinks away.
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
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          if (!frame) setFrame({ top: y, height });
        }}
        style={[
          styles.panel,
          elevation.dialog,
          placement,
          {
            backgroundColor: theme.colors.surfaceRaised,
            opacity: frame
              ? sheet.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] })
              : 0,
            transformOrigin: [origin.x - spacing.lg, origin.y - (frame?.top ?? 0), 0],
            transform: [
              { scale: sheet.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) },
            ],
          },
        ]}
      >
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
                    <Text style={[typography.headline, { color: theme.colors.text }]}>{label}</Text>
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  panel: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radii.sheet,
    padding: spacing.lg,
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
