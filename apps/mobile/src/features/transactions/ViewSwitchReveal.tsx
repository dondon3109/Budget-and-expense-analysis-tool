import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";

/**
 * Fades and slides a Transactions view in when the user switches tabs. Callers key it by the
 * view so each switch remounts it. `direction` is the side the new tab sits on (1 right, -1 left);
 * 0 renders in place, so the screen's first paint never waits on the Reduce Motion answer.
 */
export function ViewSwitchReveal({
  children,
  direction,
}: PropsWithChildren<{ direction: -1 | 0 | 1 }>) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(direction === 0 ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion === undefined) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, progress]);
  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: progress,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [direction * 32, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
