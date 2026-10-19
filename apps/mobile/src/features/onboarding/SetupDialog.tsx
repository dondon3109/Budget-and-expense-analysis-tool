import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

// The scrim is the dark `overlay` token in every theme, so the track under the card is white.
const ON_SCRIM = "#ffffff";
const DOT = 30;

/**
 * Where the user is in setup: `count` steps in all, the last one being the closing thank-you.
 * A done step from `backFrom` on can be tapped to return to it with `onBack`; earlier ones are
 * already saved on the Worker and stay put.
 */
export type SetupProgress = {
  current: number;
  count: number;
  backFrom?: number;
  onBack?: (index: number) => void;
};

/**
 * One first-run step as a centered card over the dimmed Home, with the numbered step track
 * (1, 2, 3, …, then a check for the end) under it. The route is a transparent modal drawn under
 * the system bars, so the layout keeps clear of them; a tall step scrolls inside the card.
 */
export function SetupDialog({
  progress,
  icon,
  title,
  description,
  children,
}: {
  progress?: SetupProgress;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const theme = useZoptionTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.layer,
        {
          backgroundColor: theme.colors.overlay,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Android resizes for the keyboard on its own; iOS needs the padding. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.center}
      >
        <View
          style={[
            styles.card,
            elevation.dialog,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.heading}>
              {icon ? (
                <View style={[styles.icon, { backgroundColor: theme.colors.brandSoft }]}>
                  <MaterialCommunityIcons name={icon} size={36} color={theme.colors.brand} />
                </View>
              ) : null}
              <Text
                accessibilityRole="header"
                style={[typography.title, styles.centered, { color: theme.colors.text }]}
              >
                {title}
              </Text>
              <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
                {description}
              </Text>
            </View>
            {children}
          </ScrollView>
        </View>
        {progress ? <StepTrack progress={progress} /> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Numbered dots joined by a line, ending in a check. Done steps are filled, the current one is
 * ringed, and a done step the user may revisit is a button.
 */
function StepTrack({ progress }: { progress: SetupProgress }) {
  const theme = useZoptionTheme();
  const { current, count, backFrom, onBack } = progress;
  return (
    <View style={styles.track}>
      {Array.from({ length: count }, (_, index) => {
        const done = index < current;
        const here = index === current;
        const last = index === count - 1;
        const back = onBack && backFrom !== undefined && done && index >= backFrom ? onBack : null;
        const name = last ? "the last step" : `step ${index + 1}`;
        return (
          <View key={index} style={styles.trackItem}>
            {index > 0 ? (
              <View
                style={[
                  styles.line,
                  { backgroundColor: ON_SCRIM, opacity: index <= current ? 0.9 : 0.35 },
                ]}
              />
            ) : null}
            <Pressable
              accessibilityLabel={back ? `Back to ${name}` : here ? `On ${name} of ${count}` : name}
              accessibilityRole={back ? "button" : undefined}
              disabled={!back}
              hitSlop={spacing.xs}
              onPress={back ? withTapSound(() => back(index)) : undefined}
              style={[
                styles.dot,
                {
                  backgroundColor: done || here ? ON_SCRIM : "transparent",
                  borderColor: here ? theme.colors.brand : ON_SCRIM,
                  borderWidth: here ? 3 : 2,
                  opacity: done || here ? 1 : 0.6,
                },
              ]}
            >
              {last ? (
                <MaterialCommunityIcons
                  name="check"
                  size={16}
                  color={here ? theme.colors.brand : ON_SCRIM}
                />
              ) : (
                <Text
                  style={[
                    typography.label,
                    { color: done ? theme.colors.brand : here ? theme.colors.text : ON_SCRIM },
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  card: {
    width: "100%",
    maxWidth: 440,
    flexShrink: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: { padding: spacing.lg, gap: spacing.md },
  heading: { gap: spacing.xs, marginBottom: spacing.xs },
  centered: { textAlign: "center" },
  icon: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  track: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg },
  trackItem: { flexDirection: "row", alignItems: "center" },
  line: { width: 14, height: 2, borderRadius: 1 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
