import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, type ColorValue, Easing, StyleSheet, View } from "react-native";

interface RadarWaveRingsProps {
  color: ColorValue;
  size?: number;
}

export function RadarWaveRings({ color, size = 104 }: RadarWaveRingsProps) {
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;

    const createWaveLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = createWaveLoop(wave1, 0);
    const a2 = createWaveLoop(wave2, 900);

    a1.start();
    a2.start();

    return () => {
      a1.stop();
      a2.stop();
    };
  }, [wave1, wave2]);

  const scale1 = wave1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.38],
  });
  const opacity1 = wave1.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.65, 0.45, 0],
  });

  const scale2 = wave2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.38],
  });
  const opacity2 = wave2.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.65, 0.45, 0],
  });

  const ringStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: color,
  };

  return (
    <View style={[styles.radarContainer, { width: size, height: size }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.radarRing,
          ringStyle,
          {
            opacity: opacity1,
            transform: [{ scale: scale1 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.radarRing,
          ringStyle,
          {
            opacity: opacity2,
            transform: [{ scale: scale2 }],
          },
        ]}
      />
    </View>
  );
}

interface ThinkingSphereCoreProps {
  color: ColorValue;
}

export function ThinkingSphereCore({ color }: ThinkingSphereCoreProps) {
  const spinOuter = useRef(new Animated.Value(0)).current;
  const spinInner = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;

    const outerLoop = Animated.loop(
      Animated.timing(spinOuter, {
        toValue: 1,
        duration: 3600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const innerLoop = Animated.loop(
      Animated.timing(spinInner, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.15,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 0.88,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    outerLoop.start();
    innerLoop.start();
    pulseLoop.start();

    return () => {
      outerLoop.stop();
      innerLoop.stop();
      pulseLoop.stop();
    };
  }, [pulseScale, spinInner, spinOuter]);

  const outerRotation = spinOuter.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const innerRotation = spinInner.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"],
  });

  return (
    <View style={styles.coreContainer}>
      <Animated.View
        style={[
          styles.orbitalOuter,
          {
            borderColor: "rgba(255, 255, 255, 0.72)",
            transform: [{ rotate: outerRotation }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orbitalInner,
          {
            borderColor: "rgba(255, 255, 255, 0.52)",
            transform: [{ rotate: innerRotation }],
          },
        ]}
      />
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseScale }] }]}>
        <MaterialCommunityIcons name="creation" size={24} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  radarContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  radarRing: {
    position: "absolute",
    borderWidth: 2,
  },
  coreContainer: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitalOuter: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  orbitalInner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dotted",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
