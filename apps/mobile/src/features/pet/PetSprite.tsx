import { useEffect, useId, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from "react-native-svg";

import type { PetLayer, PetPart, PetShape } from "./art";
import type { PetMood } from "./pet-labels";
import { withTapSound } from "@/features/sounds/sound-effects";

const CANVAS = 200;

type Transform = Extract<
  Animated.WithAnimatedValue<ViewStyle>["transform"],
  readonly unknown[]
>[number];

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

function LayerSvg({ layer, size, clipId }: { layer: PetLayer; size: number; clipId: string }) {
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

function useReduceMotion(): boolean {
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
  return reduce;
}

const timing = (value: Animated.Value, toValue: number, duration: number) =>
  Animated.timing(value, {
    toValue,
    duration,
    easing: Easing.inOut(Easing.quad),
    useNativeDriver: true,
  });

export interface PetSpriteProps {
  art: PetLayer[];
  mood: PetMood;
  size: number;
  accessibilityLabel: string;
  /** Called after the tap reaction starts. Without it the sprite is still tappable for fun. */
  onPress?: () => void;
  /** A still picture: no idle motion and no tap target, for pickers and lists. */
  still?: boolean;
}

/**
 * Draws a pet and keeps it moving: cute pets bob, blink, and wiggle their ears and tail; a Monster
 * shakes, breathes heavily, and pulses its aura; sick pets shiver and fading pets flicker. Every
 * motion runs on the native driver, and Reduce Motion turns the idle motion off.
 */
export function PetSprite({
  art,
  mood,
  size,
  accessibilityLabel,
  onPress,
  still = false,
}: PetSpriteProps) {
  const reduceMotion = useReduceMotion();
  const idle = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const tap = useRef(new Animated.Value(0)).current;
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = size / CANVAS;

  useEffect(() => {
    idle.setValue(0);
    blink.setValue(1);
    if (reduceMotion || still) return;
    const period = mood === "aggressive" ? 1600 : mood === "egg" ? 1400 : 1200;
    const loops = [
      Animated.loop(Animated.sequence([timing(idle, 1, period), timing(idle, 0, period)])),
    ];
    if (mood === "cute" || mood === "egg") {
      loops.push(
        Animated.loop(
          Animated.sequence([Animated.delay(3200), timing(blink, 0.1, 80), timing(blink, 1, 120)]),
        ),
      );
    }
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [blink, idle, mood, reduceMotion, still]);

  const react = () => {
    tap.setValue(0);
    Animated.sequence([
      timing(tap, 1, mood === "aggressive" ? 120 : 160),
      Animated.spring(tap, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };

  const range = (outputRange: number[] | string[]) =>
    idle.interpolate({
      inputRange: outputRange.map((_, i) => i / (outputRange.length - 1)),
      outputRange,
    });

  const whole: Transform[] = [];
  let opacity: Animated.AnimatedInterpolation<number> | number = 1;
  if (mood === "egg") {
    whole.push({ rotate: range(["-3deg", "3deg"]) });
    whole.push({ translateY: tap.interpolate({ inputRange: [0, 1], outputRange: [0, -10 * k] }) });
  } else if (mood === "cute") {
    whole.push({
      translateY: Animated.add(
        range([0, -4 * k]),
        tap.interpolate({ inputRange: [0, 1], outputRange: [0, -20 * k] }),
      ),
    });
    whole.push({
      scaleY: Animated.add(
        range([1, 1.03]),
        tap.interpolate({ inputRange: [0, 1], outputRange: [0, -0.08] }),
      ),
    });
  } else if (mood === "aggressive") {
    whole.push({
      translateX: Animated.add(
        range([0, 1.5 * k, 0, -1.5 * k, 0]),
        tap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6 * k, 6 * k] }),
      ),
    });
    whole.push({
      scale: Animated.add(
        range([1, 1.04]),
        tap.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
      ),
    });
  } else if (mood === "sick") {
    whole.push({ translateX: range([0, 1.2 * k, -1.2 * k, 1.2 * k, -1.2 * k, 0]) });
    whole.push({ scaleY: 0.96 });
    opacity = 0.8;
  } else {
    opacity = range([0.35, 0.7]);
  }

  const partTransform = (part: PetPart): Transform[] => {
    if (part === "eyes" && mood === "sick") return [{ scaleY: 0.55 }];
    if (part === "eyes") return [{ scaleY: blink }];
    if (mood !== "cute" && mood !== "aggressive") return [];
    if (part === "ears") return [{ rotate: range(["-5deg", "5deg"]) }];
    if (part === "tail") return [{ rotate: range(["-14deg", "14deg"]) }];
    if (part === "arms" && mood === "aggressive") return [{ rotate: range(["-3deg", "3deg"]) }];
    return [];
  };

  const picture = (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { opacity, transform: whole, transformOrigin: [size / 2, size * 0.95, 0] },
      ]}
    >
      {art.map((layer, index) => (
        <Animated.View
          key={index}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: layer.part === "shadow" && mood === "aggressive" ? range([0.6, 1]) : 1,
              transform: partTransform(layer.part),
              transformOrigin: [layer.origin[0] * k, layer.origin[1] * k, 0],
            },
          ]}
        >
          <LayerSvg layer={layer} size={size} clipId={`${clipBase}c${index}`} />
        </Animated.View>
      ))}
    </Animated.View>
  );
  // One element either way, so toggling `still` never remounts the animated views mid-loop.
  return (
    <Pressable
      accessibilityRole={still ? "image" : "imagebutton"}
      accessibilityLabel={accessibilityLabel}
      disabled={still}
      onPress={withTapSound(react)}
      style={{ width: size, height: size }}
    >
      {picture}
    </Pressable>
  );
}
