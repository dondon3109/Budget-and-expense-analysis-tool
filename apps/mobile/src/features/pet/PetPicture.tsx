import { petMood, type PetSpecies, type PetView } from "@zoption/shared";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useReduceMotion } from "@/ui/reduce-motion";

import { petImage } from "./pet-images";

// How long one idle swing takes: a calm breath, a quick shiver, or a slow faint breath.
const IDLE_MS = { cute: 1300, sick: 90, fading: 2200 } as const;

const loopBetween = (value: Animated.Value, duration: number) =>
  Animated.loop(
    Animated.sequence(
      [1, 0].map((toValue) =>
        Animated.timing(value, {
          toValue,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ),
  );

interface PetPictureProps {
  pet: PetView & { species: PetSpecies };
  size: number;
  accessibilityLabel: string;
}

/**
 * A hatched pet as its Grok picture. A healthy pet breathes and blinks (an eyes-closed copy of
 * the same picture flashes on top), a sick one shows its sick picture and shivers, and a fading
 * one shows its fading picture and barely breathes. Tapping bounces it. Every motion runs on the
 * native driver, and Reduce Motion keeps it still.
 */
export function PetPicture({ pet, size, accessibilityLabel }: PetPictureProps) {
  const reduceMotion = useReduceMotion();
  const mood = petMood(pet);
  const idle = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const tap = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    idle.setValue(0);
    blink.setValue(0);
    if (reduceMotion) return;
    if (mood === "egg") return;
    const loops = [loopBetween(idle, IDLE_MS[mood])];
    if (mood === "cute") {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(3200),
            Animated.timing(blink, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.delay(130),
            Animated.timing(blink, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ),
      );
    }
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [blink, idle, mood, reduceMotion]);

  const bounce = () => {
    tap.setValue(0);
    Animated.sequence([
      Animated.timing(tap, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(tap, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  const along = (from: number, to: number) =>
    idle.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const hop = tap.interpolate({ inputRange: [0, 1], outputRange: [0, -0.08 * size] });
  const motion =
    mood === "sick"
      ? [{ translateX: along(-0.006 * size, 0.006 * size) }, { translateY: hop }]
      : [
          { translateY: Animated.add(along(0, mood === "fading" ? 0 : -0.015 * size), hop) },
          {
            scaleY: Animated.add(
              along(1, mood === "fading" ? 1.012 : 1.025),
              tap.interpolate({ inputRange: [0, 1], outputRange: [0, -0.06] }),
            ),
          },
        ];
  const look = mood === "sick" || mood === "fading" ? mood : "healthy";
  // Explicit sizes, not absoluteFill: Android otherwise draws the picture at its 512px file size.
  const box = { position: "absolute" as const, top: 0, left: 0, width: size, height: size };

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      onPress={withTapSound(bounce)}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[box, { transform: motion, transformOrigin: [size / 2, size * 0.95, 0] }]}
      >
        <Image
          accessibilityIgnoresInvertColors
          source={petImage(pet.species, pet.stage, look)}
          style={box}
        />
        {mood === "cute" ? (
          <Animated.Image
            accessibilityIgnoresInvertColors
            source={petImage(pet.species, pet.stage, "blink")}
            style={[box, { opacity: blink }]}
          />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
