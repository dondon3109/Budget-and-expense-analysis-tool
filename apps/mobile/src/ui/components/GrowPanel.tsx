import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "@/ui/reduce-motion";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing } from "@/ui/tokens";

/** Where a panel grows from: the touch point, plus the pressed control's top and bottom edges. */
export interface GrowAnchor {
  x: number;
  y: number;
  top: number;
  bottom: number;
}

/**
 * Reads the anchor from a press. The control is measured so the panel opens clear of it; when it
 * cannot be measured the touch point stands in for both edges. Null when the press carries no
 * touch point (a call from code rather than a tap).
 */
export function measureGrowAnchor(
  event: GestureResponderEvent | undefined,
  onAnchor: (anchor: GrowAnchor | null) => void,
): void {
  const touch = event?.nativeEvent;
  if (!touch || !Number.isFinite(touch.pageX) || !Number.isFinite(touch.pageY)) {
    onAnchor(null);
    return;
  }
  const { pageX: x, pageY: y } = touch;
  const target = event.currentTarget as unknown as Partial<View> | null;
  if (typeof target?.measureInWindow !== "function") {
    onAnchor({ x, y, top: y, bottom: y });
    return;
  }
  target.measureInWindow((_left, top, _width, height) =>
    onAnchor({ x, y, top, bottom: top + height }),
  );
}

const CLOSE_MS = 180;
const GAP = 12;

/**
 * A full-screen layer whose panel scales out of `anchor` over a fading scrim and shrinks back into
 * it on close. It opens below a control in the top half of the screen and above one in the bottom
 * half; without an anchor it grows from the bottom edge. `children` gets `close`, which runs its
 * callback once the panel is gone, and `ready`, true once the panel is measured and growing.
 */
export function GrowPanel({
  anchor,
  onDismiss,
  children,
}: {
  anchor: GrowAnchor | null;
  onDismiss: () => void;
  children: (panel: { close: (after: () => void) => void; ready: boolean }) => ReactNode;
}) {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [leaving, setLeaving] = useState(false);
  // The panel's laid-out top, needed to aim the scale at the origin.
  const [top, setTop] = useState<number | null>(null);
  const grow = useRef(new Animated.Value(0)).current;

  const origin = anchor ?? { x: window.width / 2, y: window.height - insets.bottom };
  const below = anchor !== null && anchor.y < window.height / 2;
  const edge = below
    ? Math.max(insets.top + GAP, anchor.bottom + GAP)
    : Math.max(insets.bottom + GAP, window.height - (anchor?.top ?? origin.y) + GAP);
  const placement = below ? { top: edge } : { bottom: edge };
  // The room between the panel's anchored edge and the far safe edge; a long list scrolls inside.
  const maxHeight = window.height - edge - (below ? insets.bottom : insets.top) - GAP;
  const ready = top !== null && reduceMotion !== undefined;

  useEffect(() => {
    if (!ready) return;
    if (reduceMotion) {
      grow.setValue(1);
      return;
    }
    Animated.spring(grow, {
      toValue: 1,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [ready, reduceMotion, grow]);

  const close = (after: () => void) => {
    if (leaving) return;
    setLeaving(true);
    if (reduceMotion) {
      after();
      return;
    }
    Animated.timing(grow, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(after);
  };

  return (
    <View style={styles.layer}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay, opacity: grow }]}
      >
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={() => close(onDismiss)}
        />
      </Animated.View>
      <Animated.View
        onLayout={(event) => {
          if (top === null) setTop(event.nativeEvent.layout.y);
        }}
        style={[
          styles.panel,
          elevation.dialog,
          placement,
          {
            maxHeight: Math.max(240, maxHeight),
            backgroundColor: theme.colors.surfaceRaised,
            opacity: ready
              ? grow.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] })
              : 0,
            transformOrigin: [origin.x - spacing.lg, origin.y - (top ?? 0), 0],
            transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }],
          },
        ]}
      >
        {children({ close, ready })}
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
});
