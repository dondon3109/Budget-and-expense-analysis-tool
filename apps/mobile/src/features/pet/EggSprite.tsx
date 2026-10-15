import { useEffect, useId, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from "react-native-svg";

import type { PetLayer, PetShape } from "@zoption/shared";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useReduceMotion } from "@/ui/reduce-motion";

const CANVAS = 200;

function Shape({ shape }: { shape: PetShape }) {
  const paint = {
    fill: shape.fill ?? "none",
    stroke: shape.stroke,
    strokeWidth: shape.stroke ? shape.strokeWidth : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity: shape.opacity,
  };
  if (shape.kind === "path") return <Path d={shape.d} {...paint} />;
  if (shape.kind === "circle") return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
  return (
    <Ellipse
      cx={shape.cx}
      cy={shape.cy}
      rx={shape.rx}
      ry={shape.ry}
      rotation={shape.rotate}
      origin={shape.rotate ? `${shape.cx}, ${shape.cy}` : undefined}
      {...paint}
    />
  );
}

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
  const shapes = layer.shapes.map((shape, index) => <Shape key={index} shape={shape} />);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
      {layer.clip ? (
        <>
          <Defs>
            <ClipPath id={clipId}>
              <Path d={layer.clip} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${clipId})`}>{shapes}</G>
        </>
      ) : (
        shapes
      )}
    </Svg>
  );
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
}

/** Draws an egg that sways gently and hops when tapped. Reduce Motion stops the sway. */
export function EggSprite({
  art,
  size,
  accessibilityLabel,
  onPress,
  still = false,
}: EggSpriteProps) {
  const reduceMotion = useReduceMotion();
  const sway = useRef(new Animated.Value(0)).current;
  const tap = useRef(new Animated.Value(0)).current;
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = size / CANVAS;

  useEffect(() => {
    sway.setValue(0);
    if (reduceMotion || still) return;
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

  // One element either way, so toggling `still` never remounts the animated view mid-loop.
  return (
    <Pressable
      accessibilityRole={still ? "image" : "imagebutton"}
      accessibilityLabel={accessibilityLabel}
      disabled={still}
      onPress={withTapSound(hop)}
      style={{ width: size, height: size }}
    >
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
    </Pressable>
  );
}
