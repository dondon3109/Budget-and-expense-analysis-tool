import { useEffect, useId, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import type { PetLayer } from "@zoption/shared";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useReduceMotion } from "@/ui/reduce-motion";

import { PetArtSvg } from "./PetArtSvg";

const CANVAS = 200;

/** One art layer as a plain SVG; also draws the hatch shine. */
export function LayerSvg({
  layer,
  size,
  clipId,
}: {
  layer: PetLayer;
  size: number;
  clipId: string;
}) {
  return <PetArtSvg layers={[layer]} size={size} idBase={clipId} />;
}

const timing = (value: Animated.Value, toValue: number, duration: number) =>
  Animated.timing(value, {
    toValue,
    duration,
    easing: Easing.inOut(Easing.quad),
    useNativeDriver: true,
  });

export interface EggSpriteProps {
  art: PetLayer[];
  size: number;
  accessibilityLabel: string;
  /** Called after the tap hop starts. Without it the egg is still tappable for fun. */
  onPress?: () => void;
  /** A still picture: no sway and no tap target, for the picker. */
  still?: boolean;
  /** Disables the inner tap target and hides duplicate a11y semantics inside an outer radio card. */
  interactive?: boolean;
}

/** Draws an egg that sways gently and hops when tapped. Reduce Motion stops the sway. */
export function EggSprite({
  art,
  size,
  accessibilityLabel,
  onPress,
  still = false,
  interactive = true,
}: EggSpriteProps) {
  const reduceMotion = useReduceMotion();
  const sway = useRef(new Animated.Value(0)).current;
  const tap = useRef(new Animated.Value(0)).current;
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = size / CANVAS;

  useEffect(() => {
    sway.setValue(0);
    if (reduceMotion !== false || still) return;
    const loop = Animated.loop(Animated.sequence([timing(sway, 1, 1400), timing(sway, 0, 1400)]));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, still, sway]);

  const hop = () => {
    tap.setValue(0);
    Animated.sequence([
      timing(tap, 1, 160),
      Animated.spring(tap, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };

  const layers = (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [
            { rotate: sway.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "3deg"] }) },
            { translateY: tap.interpolate({ inputRange: [0, 1], outputRange: [0, -10 * k] }) },
          ],
          transformOrigin: [size / 2, size * 0.95, 0],
        },
      ]}
    >
      {art.map((layer, index) => (
        <View key={index} style={StyleSheet.absoluteFill}>
          <LayerSvg layer={layer} size={size} clipId={`${clipBase}c${index}`} />
        </View>
      ))}
    </Animated.View>
  );

  if (!interactive) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size }}
      >
        {layers}
      </View>
    );
  }

  // One element either way, so toggling `still` never remounts the animated view mid-loop.
  return (
    <Pressable
      accessibilityRole={still ? "image" : "imagebutton"}
      accessibilityLabel={accessibilityLabel}
      disabled={still}
      onPress={withTapSound(hop)}
      style={{ width: size, height: size }}
    >
      {layers}
    </Pressable>
  );
}
