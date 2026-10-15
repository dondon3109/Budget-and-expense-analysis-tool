import {
  PET_DAILY_POINT_CEILING,
  PET_STAGE_THRESHOLDS,
  petEarningRows,
  petStageEmoji,
  petStageLabels,
  petStages,
  type PetView,
} from "@zoption/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

// The playful pieces of the pet page: the spotlight the pet stands in, the hearts it sends up
// when petted, its status chips, the growth path, and the earning tiles.

type Tone = "brand" | "health" | "sick" | "fading" | "sun";

export function healthTone(state: PetView["healthState"]): Tone {
  if (state === "sick") return "sick";
  if (state === "fading" || state === "dead") return "fading";
  return "health";
}

function healthEmoji(state: PetView["healthState"]): string {
  if (state === "sick") return "🤒";
  if (state === "fading" || state === "dead") return "🥀";
  return "💚";
}

/** The fill and soft background each tone uses, from the active theme. */
export function useToneColors(): Record<Tone, { fill: string; soft: string }> {
  const { colors } = useZoptionTheme();
  return {
    brand: { fill: String(colors.brand), soft: String(colors.brandSoft) },
    health: { fill: String(colors.income), soft: String(colors.brandSoft) },
    sick: { fill: String(colors.expense), soft: String(colors.warningSoft) },
    fading: { fill: String(colors.danger), soft: String(colors.dangerSoft) },
    sun: { fill: String(colors.warning), soft: String(colors.warningSoft) },
  };
}

const SPARKLES = [
  { glyph: "✦", top: "6%", left: "8%", size: 20 },
  { glyph: "★", top: "12%", right: "6%", size: 16 },
  { glyph: "✧", bottom: "20%", left: "2%", size: 20 },
  { glyph: "♥", bottom: "24%", right: "4%", size: 14 },
] as const;

/** A soft disc with a ground shadow and drifting sparkles; the pet stands in the middle. */
export function PetSpotlight({ size, children }: { size: number; children: ReactNode }) {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  const stage = size * 1.35;
  const sparkleColors = [
    theme.colors.warning,
    theme.colors.budget,
    theme.colors.info,
    theme.colors.expense,
  ];
  return (
    <View style={[styles.spotlight, { width: stage, height: stage }]}>
      <View
        style={[
          styles.disc,
          { backgroundColor: theme.colors.brandSoft },
          theme.clay ? { boxShadow: "inset 0px -10px 0px rgba(107, 63, 217, 0.1)" } : null,
        ]}
      />
      <View style={[styles.ground, { backgroundColor: theme.colors.border, width: size * 0.6 }]} />
      {SPARKLES.map((sparkle, index) => (
        <Animated.Text
          key={sparkle.glyph}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            styles.sparkle,
            sparkle,
            {
              color: sparkleColors[index],
              fontSize: sparkle.size,
              transform: [
                {
                  translateY: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: index % 2 === 0 ? [4, -6] : [-6, 4],
                  }),
                },
              ],
            },
          ]}
        >
          {sparkle.glyph}
        </Animated.Text>
      ))}
      {children}
    </View>
  );
}

const HEART_DRIFTS = [-40, -14, 14, 40];

/** A floating heart that rises and fades once, then stays hidden. */
function Heart({ drift, delay, emoji }: { drift: number; delay: number; emoji: string }) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 900,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [delay, rise]);
  return (
    <Animated.Text
      style={[
        styles.heart,
        {
          opacity: rise.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateX: rise.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -110] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

/**
 * A hatched pet the user can pet: each tap sends a burst of hearts up from it. Purely a delight
 * on this screen; nothing is sent to the Worker.
 */
export function PettablePet({ name, children }: { name: string; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const [pets, setPets] = useState(0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pet ${name}`}
      onPress={() => setPets((count) => count + 1)}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      {children}
      {pets > 0 && !reduceMotion ? (
        <View key={pets} pointerEvents="none" style={styles.hearts}>
          {HEART_DRIFTS.map((drift, index) => (
            <Heart
              key={drift}
              drift={drift}
              delay={index * 60}
              emoji={index % 2 === 0 ? "💜" : "💖"}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  const theme = useZoptionTheme();
  const tones = useToneColors();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: tones[tone].soft },
        theme.clay
          ? {
              boxShadow:
                "inset 0px 2px 0px rgba(255, 255, 255, 0.9), inset 0px -3px 0px rgba(74, 37, 166, 0.1)",
            }
          : null,
      ]}
    >
      <Text style={[typography.label, { color: theme.colors.text }]}>{children}</Text>
    </View>
  );
}

export function PetChips({ pet }: { pet: PetView }) {
  if (pet.stage === "egg") {
    return (
      <View style={styles.chips}>
        <Chip tone="sun">
          🔥 {pet.eggStreakDays} day{pet.eggStreakDays === 1 ? "" : "s"} streak
        </Chip>
      </View>
    );
  }
  return (
    <View style={styles.chips}>
      <Chip tone="brand">⭐ {pet.points} pts</Chip>
      <Chip tone={healthTone(pet.healthState)}>
        {healthEmoji(pet.healthState)} {pet.health ?? 0}% health
      </Chip>
      <Chip tone="sun">☀️ {pet.pointsToday} today</Chip>
    </View>
  );
}

/** Egg to Legend as a row of badges, lit up to the pet's current stage. */
export function GrowthPath({ stage }: { stage: PetView["stage"] }) {
  const theme = useZoptionTheme();
  const reached = petStages.indexOf(stage);
  return (
    <View
      accessible
      accessibilityLabel={`Growth path: ${petStageLabels[stage]} now`}
      style={styles.path}
    >
      {petStages.map((step, index) => {
        const lit = index <= reached;
        const now = index === reached;
        return (
          // Earlier steps sit above later ones, so each track runs under the previous badge.
          <View key={step} style={[styles.pathStep, { zIndex: petStages.length - index }]}>
            {index > 0 ? (
              <View
                style={[
                  styles.pathTrack,
                  { backgroundColor: lit ? theme.colors.brand : theme.colors.border },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.pathBadge,
                {
                  borderColor: lit ? theme.colors.brand : theme.colors.border,
                  backgroundColor: now ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                  transform: [{ scale: now ? 1.12 : 1 }],
                },
              ]}
            >
              {/* Only the emoji dims: a see-through badge would show the track across it. */}
              <Text style={{ fontSize: 18, opacity: lit ? 1 : 0.45 }}>{petStageEmoji[step]}</Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.text }]}>
              {petStageLabels[step]}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted, fontSize: 10 }]}>
              {step === "egg" ? "7 days" : `${PET_STAGE_THRESHOLDS[step]} pts`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** How to earn points as colorful tiles, always on show. */
export function EarnTiles() {
  const theme = useZoptionTheme();
  const tones = useToneColors();
  const tileTones: Tone[] = ["sun", "brand", "health"];
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.title, { color: theme.colors.text }]}>How to earn points</Text>
      <View style={styles.tiles}>
        {petEarningRows.map((row, index) => (
          <View
            key={row.label}
            style={[
              styles.tile,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
            ]}
          >
            <View
              style={[
                styles.tileIcon,
                { backgroundColor: tones[tileTones[index % 3] ?? "sun"].soft },
              ]}
            >
              <Text style={{ fontSize: 18 }}>{row.emoji}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[typography.label, { color: theme.colors.text }]}>{row.label}</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                +{row.rule.points} pts · {row.rule.dailyCount}× a day
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Doing three different things in a day adds a 10 point bonus. A day earns at most{" "}
        {PET_DAILY_POINT_CEILING} points.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spotlight: { alignItems: "center", justifyContent: "center" },
  disc: {
    position: "absolute",
    top: "6%",
    left: "6%",
    right: "6%",
    bottom: "6%",
    borderRadius: radii.round,
  },
  ground: { position: "absolute", bottom: "17%", height: 12, borderRadius: radii.round },
  sparkle: { position: "absolute" },
  hearts: { position: "absolute", top: "30%", left: 0, right: 0, alignItems: "center" },
  heart: { position: "absolute", fontSize: 24 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.round },
  path: { flexDirection: "row", alignSelf: "stretch" },
  pathStep: { flex: 1, alignItems: "center", gap: 2 },
  pathTrack: {
    position: "absolute",
    top: 18,
    right: "50%",
    width: "100%",
    height: 4,
    borderRadius: radii.round,
  },
  pathBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: { gap: spacing.sm },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
