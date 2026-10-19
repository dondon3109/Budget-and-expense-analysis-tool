import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";

/**
 * Fades and lifts content into place on mount: the whole editor as its modal opens, and the
 * review form once a voice draft replaces the mic. `style` replaces the default `flex: 1`.
 */
export function EntryReveal({
  children,
  style = styles.fill,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion === undefined) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
