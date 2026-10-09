import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  type ColorValue,
  Easing,
  StyleSheet,
  View,
} from "react-native";

export type VoiceOrbStatus = "idle" | "preparing" | "listening" | "thinking" | "speaking";

/** Loops are skipped under Jest and for people who asked the OS to reduce motion. */
function useMotionEnabled(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return process.env.NODE_ENV !== "test" && !reduce;
}

/** Per-status motion: how fast and how far the orb breathes, and whether ripples radiate. */
const ORB_MOTION: Record<VoiceOrbStatus, { period: number; scale: number; ripples: number }> = {
  idle: { period: 2600, scale: 0.04, ripples: 0 },
  preparing: { period: 900, scale: 0.05, ripples: 0 },
  listening: { period: 1100, scale: 0.07, ripples: 2 },
  thinking: { period: 1600, scale: 0.02, ripples: 0 },
  speaking: { period: 700, scale: 0.06, ripples: 3 },
};

/**
 * Wraps the orb button: it breathes while idle, pulses faster while listening or speaking, and
 * radiates ripples behind it so the state reads at a glance.
 */
export function VoiceOrbMotion({
  status,
  size,
  color,
  behind,
  children,
}: {
  status: VoiceOrbStatus;
  size: number;
  color: ColorValue;
  /** Extra decoration drawn behind the orb, such as the thinking rings. */
  behind?: ReactNode;
  children: ReactNode;
}) {
  const motion = useMotionEnabled();
  const { period, scale, ripples } = ORB_MOTION[status];
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motion) return;
    breathe.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: period / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: period / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, motion, period]);

  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + scale] });

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {behind}
      {motion
        ? Array.from({ length: ripples }, (_, index) => (
            <Ripple
              key={`${status}-${index}`}
              color={color}
              size={size}
              duration={status === "speaking" ? 1500 : 2000}
              delay={(index * (status === "speaking" ? 1500 : 2000)) / ripples}
            />
          ))
        : null}
      <Animated.View style={{ transform: [{ scale: orbScale }] }}>{children}</Animated.View>
    </View>
  );
}

function Ripple({
  color,
  size,
  duration,
  delay,
}: {
  color: ColorValue;
  size: number;
  duration: number;
  delay: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, duration, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ripple,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.28, 0] }),
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) },
          ],
        },
      ]}
    />
  );
}

/** Bar heights as a fraction of the full height, per status and bar (a centered hump). */
const BAR_SHAPE = [0.45, 0.75, 1, 0.75, 0.45];
const BAR_HEIGHT = 32;

/** Five-bar equalizer: flat dots at rest, bouncing while listening or speaking, rippling while thinking. */
export function VoiceEqualizer({
  status,
  activeColor,
  restColor,
}: {
  status: VoiceOrbStatus;
  activeColor: ColorValue;
  restColor: ColorValue;
}) {
  const motion = useMotionEnabled();
  const bars = useRef(BAR_SHAPE.map(() => new Animated.Value(0))).current;
  const active = status !== "idle";

  useEffect(() => {
    if (!motion || !active) {
      for (const bar of bars) bar.setValue(0);
      return;
    }
    const speed = status === "speaking" ? 340 : status === "listening" ? 260 : 520;
    const loops = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 70),
          Animated.timing(bar, {
            toValue: 1,
            duration: speed + index * 40,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0,
            duration: speed + index * 40,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [active, bars, motion, status]);

  return (
    <View style={styles.equalizer} accessibilityElementsHidden aria-hidden>
      {BAR_SHAPE.map((shape, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              height: BAR_HEIGHT * shape,
              backgroundColor: active ? activeColor : restColor,
              // Rest is a short dot; motion stretches each bar from 0.3 up to its full shape.
              transform: [
                {
                  scaleY: active
                    ? motion
                      ? bars[index]!.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
                      : 1
                    : 0.14,
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", justifyContent: "center" },
  ripple: { position: "absolute" },
  equalizer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: BAR_HEIGHT,
  },
  bar: { width: 5, borderRadius: 3 },
});
