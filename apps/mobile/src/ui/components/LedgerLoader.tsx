import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";

/**
 * Zoption loading mark, matching the web LedgerLoader: three ledger rows, each
 * swept by a fill that enters from the left and leaves to the right, one row
 * after another. Under reduced motion the rows rest filled, which is the mark.
 */

const SIZES = {
  large: { width: 112, row: 10, gap: 10 },
  small: { width: 44, row: 5, gap: 5 },
} as const;

/** Each row's share of the loader width, shortest last. */
const ROW_SHARES = [1, 0.76, 0.48] as const;

const STAGGER_MS = 160;
const ENTER_MS = 720;
const HOLD_MS = 240;
const EXIT_MS = 640;
const EASING = Easing.bezier(0.65, 0, 0.35, 1);

export function LedgerLoader({
  size = "large",
  accessibilityLabel = "Loading",
}: {
  size?: keyof typeof SIZES;
  accessibilityLabel?: string;
}) {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const dims = SIZES[size];
  // 0 = before the row, 1 = filling it, 2 = past it.
  const sweeps = useRef(ROW_SHARES.map(() => new Animated.Value(0))).current;

  // Sweep only once the setting is known to be off; until then the rows sit
  // empty, so a reduced-motion reader never sees a sweep start and stop.
  useEffect(() => {
    if (reduceMotion !== false) return;
    const animation = Animated.parallel(
      sweeps.map((sweep, index) =>
        Animated.sequence([
          Animated.delay(index * STAGGER_MS),
          Animated.loop(
            Animated.sequence([
              Animated.timing(sweep, {
                toValue: 1,
                duration: ENTER_MS,
                easing: EASING,
                useNativeDriver: true,
              }),
              Animated.delay(HOLD_MS),
              Animated.timing(sweep, {
                toValue: 2,
                duration: EXIT_MS,
                easing: EASING,
                useNativeDriver: true,
              }),
            ]),
          ),
        ]),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, sweeps]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={{ width: dims.width, gap: dims.gap }}
    >
      {ROW_SHARES.map((share, index) => {
        const width = Math.round(dims.width * share);
        const sweep = sweeps[index] as Animated.Value;
        return (
          <View
            key={share}
            style={[
              styles.row,
              {
                width,
                height: dims.row,
                borderRadius: dims.row,
                backgroundColor: theme.colors.brandSoft,
              },
            ]}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: dims.row,
                  backgroundColor: theme.colors.brand,
                  transform: reduceMotion
                    ? []
                    : [
                        {
                          translateX: sweep.interpolate({
                            inputRange: [0, 1, 2],
                            outputRange: [-width, 0, width],
                          }),
                        },
                      ],
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

/** `undefined` until the platform answers, which it does asynchronously. */
function useReduceMotion(): boolean | undefined {
  const [reduceMotion, setReduceMotion] = useState<boolean>();
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

const styles = StyleSheet.create({ row: { overflow: "hidden" } });
