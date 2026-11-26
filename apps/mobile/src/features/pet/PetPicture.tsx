import {
  PET_REACTION_MOTION,
  PET_TAP_HISTORY_START,
  petFigureArt,
  petFigureHealth,
  petMood,
  petTapReaction,
  type PetReaction,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Animated, Easing, Pressable } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";

import { PetArtSvg } from "./PetArtSvg";
import { playPetReaction, warmUpPetVoices } from "./pet-sounds";
import { ReactionBurst } from "./PetPlayground";

// The figure stands on y 188 of its 200 canvas (figures.ts GROUND); it squashes and stretches there.
const FEET = 0.94;

// A healthy pet's idle hop, matching the web's pet-figure-bounce keyframes: squash before the
// hop, stretch in the air, squash on landing, then settle and rest. Lift is a share of the size.
const BOUNCE_MS = 2600;
const BOUNCE = {
  at: [0, 0.14, 0.3, 0.42, 0.54, 0.64, 0.74, 0.84, 1],
  lift: [0, 0, -0.05, -0.06, 0, 0, 0, 0, 0],
  scaleX: [1, 1.05, 0.95, 0.98, 1.07, 0.98, 1.01, 1, 1],
  scaleY: [1, 0.94, 1.06, 1.02, 0.92, 1.03, 0.99, 1.012, 1],
  // The ground shadow shrinks and fades while the pet is in the air.
  shadow: [1, 1.06, 0.84, 0.8, 1.06, 1, 1, 1, 1],
  shade: [1, 1, 0.7, 0.65, 1, 1, 1, 1, 1],
};
// A sick pet shivers quickly; a fading one barely breathes.
const SHIVER_MS = 90;
const FAINT_MS = 2200;

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
 * A hatched pet as its soft vinyl figure in its pet color. A healthy pet hops with squash and
 * stretch over a shadow that shrinks as it lifts, and blinks; a sick one shivers; a fading one
 * barely breathes. A tap answers by mood with motion, a burst, the species' voice, and a buzz;
 * five quick taps make a healthy pet dance. Petting is local only. Every motion runs on the native
 * driver, and Reduce Motion keeps it still but keeps the voice.
 */
export function PetPicture({ pet, size, accessibilityLabel }: PetPictureProps) {
  const reduceMotion = useReduceMotion();
  const mood = petMood(pet);
  const idBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idle = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const react = useRef(new Animated.Value(0)).current;
  const history = useRef(PET_TAP_HISTORY_START);
  // `id` remounts the burst and restarts the motion on every tap.
  const [tap, setTap] = useState<{ reaction: PetReaction; id: number } | null>(null);

  useEffect(() => {
    if (pet.stage !== "egg") warmUpPetVoices(pet.species, pet.stage);
  }, [pet.species, pet.stage]);

  useEffect(() => {
    idle.setValue(0);
    blink.setValue(0);
    if (reduceMotion !== false) return;
    if (mood === "egg") return;
    const loops =
      mood === "cute"
        ? [
            Animated.loop(
              Animated.timing(idle, {
                toValue: 1,
                duration: BOUNCE_MS,
                easing: Easing.linear,
                useNativeDriver: true,
              }),
            ),
            Animated.loop(
              Animated.sequence([
                Animated.delay(3200),
                Animated.timing(blink, { toValue: 1, duration: 0, useNativeDriver: true }),
                Animated.delay(130),
                Animated.timing(blink, { toValue: 0, duration: 0, useNativeDriver: true }),
              ]),
            ),
          ]
        : [loopBetween(idle, mood === "sick" ? SHIVER_MS : FAINT_MS)];
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [blink, idle, mood, reduceMotion]);

  useEffect(() => {
    react.setValue(0);
    if (!tap || reduceMotion !== false) return;
    const anim = Animated.timing(react, {
      toValue: 1,
      duration: PET_REACTION_MOTION[tap.reaction].ms,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [react, reduceMotion, tap]);

  const { species, stage } = pet;
  if (stage === "egg") return null;

  const onPress = () => {
    if (mood === "egg") return;
    const result = petTapReaction(mood, history.current, Date.now());
    history.current = result.history;
    playPetReaction(species, stage, result.reaction);
    setTap((last) => ({ reaction: result.reaction, id: (last?.id ?? 0) + 1 }));
  };

  const art = petFigureArt(species, stage, petFigureHealth(pet), pet.color);
  const keyframes = PET_REACTION_MOTION[tap?.reaction ?? "happy"];
  const reacting = (outputRange: number[] | string[]) =>
    react.interpolate({ inputRange: keyframes.at, outputRange });
  const bouncing = (outputRange: number[]) =>
    idle.interpolate({ inputRange: BOUNCE.at, outputRange });
  const along = (from: number, to: number) =>
    idle.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

  const idleMotion =
    mood === "cute"
      ? {
          x: along(0, 0),
          y: bouncing(BOUNCE.lift.map((share) => share * size)),
          scaleX: bouncing(BOUNCE.scaleX),
          scaleY: bouncing(BOUNCE.scaleY),
        }
      : mood === "sick"
        ? {
            x: along(-0.006 * size, 0.006 * size),
            y: along(0, 0),
            scaleX: along(1, 1),
            scaleY: along(1, 1),
          }
        : { x: along(0, 0), y: along(0, 0), scaleX: along(1, 1.015), scaleY: along(1, 0.985) };

  const motion = [
    { translateX: idleMotion.x },
    {
      translateY: Animated.add(idleMotion.y, reacting(keyframes.hop.map((share) => share * size))),
    },
    { rotate: reacting(keyframes.tilt.map((degrees) => `${degrees}deg`)) },
    { scaleX: idleMotion.scaleX },
    { scaleY: Animated.add(idleMotion.scaleY, reacting(keyframes.squash)) },
  ];
  // Explicit sizes, not absoluteFill, so every SVG lines up on the same canvas.
  const box = { position: "absolute" as const, top: 0, left: 0, width: size, height: size };
  const origin = { transformOrigin: [size / 2, size * FEET, 0] };

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Pets it"
      onPress={onPress}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[
          box,
          origin,
          mood === "cute"
            ? {
                opacity: bouncing(BOUNCE.shade),
                transform: [{ scale: bouncing(BOUNCE.shadow) }],
              }
            : null,
        ]}
      >
        <PetArtSvg layers={[art.shadow]} size={size} idBase={`${idBase}s`} />
      </Animated.View>
      <Animated.View style={[box, origin, { transform: motion }]}>
        <PetArtSvg layers={art.body} size={size} idBase={`${idBase}b`} />
        <Animated.View
          style={[
            box,
            art.blink
              ? { opacity: blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
              : null,
          ]}
        >
          <PetArtSvg layers={[art.eyes]} size={size} idBase={`${idBase}e`} />
        </Animated.View>
        {art.blink ? (
          <Animated.View style={[box, { opacity: blink }]}>
            <PetArtSvg layers={[art.blink]} size={size} idBase={`${idBase}k`} />
          </Animated.View>
        ) : null}
      </Animated.View>
      {tap && reduceMotion === false ? (
        <ReactionBurst key={tap.id} reaction={tap.reaction} />
      ) : null}
    </Pressable>
  );
}
