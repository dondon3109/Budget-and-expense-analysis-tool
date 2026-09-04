import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

interface CheckingRecordsIndicatorProps {
  label?: string;
  size?: "small" | "medium";
}

export function CheckingRecordsIndicator({
  label = "Checking your records…",
  size = "medium",
}: CheckingRecordsIndicatorProps) {
  const theme = useZoptionTheme();

  const bar1 = useRef(new Animated.Value(0.4)).current;
  const bar2 = useRef(new Animated.Value(0.4)).current;
  const bar3 = useRef(new Animated.Value(0.4)).current;
  const bar4 = useRef(new Animated.Value(0.4)).current;
  const textOpacity = useRef(new Animated.Value(0.72)).current;
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;

    const createBarAnim = (animVal: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animVal, {
            toValue: 1.15,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(animVal, {
            toValue: 0.35,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 320 - delay)),
        ]),
      );

    const textAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 0.65,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const iconAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(iconScale, {
          toValue: 1.12,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconScale, {
          toValue: 0.94,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const a1 = createBarAnim(bar1, 0);
    const a2 = createBarAnim(bar2, 130);
    const a3 = createBarAnim(bar3, 260);
    const a4 = createBarAnim(bar4, 390);

    a1.start();
    a2.start();
    a3.start();
    a4.start();
    textAnim.start();
    iconAnim.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      a4.stop();
      textAnim.stop();
      iconAnim.stop();
    };
  }, [bar1, bar2, bar3, bar4, iconScale, textOpacity]);

  const isSmall = size === "small";

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.iconBadge,
          {
            backgroundColor: theme.colors.brandSoft,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <MaterialCommunityIcons
          name="chart-timeline-variant"
          size={isSmall ? 12 : 13}
          color={theme.colors.brand}
        />
      </Animated.View>

      <View style={styles.barsRow}>
        <Animated.View
          style={[
            styles.bar,
            {
              height: isSmall ? 10 : 12,
              backgroundColor: theme.colors.brand,
              transform: [{ scaleY: bar1 }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bar,
            {
              height: isSmall ? 15 : 18,
              backgroundColor: theme.colors.brand,
              transform: [{ scaleY: bar2 }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bar,
            {
              height: isSmall ? 12 : 15,
              backgroundColor: theme.colors.brand,
              transform: [{ scaleY: bar3 }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bar,
            {
              height: isSmall ? 8 : 10,
              backgroundColor: theme.colors.brand,
              transform: [{ scaleY: bar4 }],
            },
          ]}
        />
      </View>

      <Animated.Text
        style={[
          isSmall ? typography.caption : typography.callout,
          styles.labelText,
          {
            color: theme.colors.textMuted,
            opacity: textOpacity,
          },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    height: 20,
  },
  bar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  labelText: {
    fontWeight: "500",
  },
});
