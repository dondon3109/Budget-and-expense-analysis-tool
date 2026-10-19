import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";

/** Fades and lifts a new entry form into place once its modal has started opening. */
export function EntryReveal({ children }: PropsWithChildren) {
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
        styles.fill,
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
