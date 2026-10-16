import {
  PET_REACTION_MOTION,
  PET_TAP_HISTORY_START,
  petMood,
  petTapReaction,
  type PetReaction,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";

import { playPetReaction, warmUpPetVoices } from "./pet-sounds";
import { ReactionBurst } from "./PetPlayground";
import { TintedPetImage } from "./TintedPetImage";

// How long one idle swing takes: a calm breath, a quick shiver, or a slow faint breath.
const IDLE_MS = { cute: 1300, sick: 90, fading: 2200 } as const;
// How far each idle swing goes, as shares of the size: a sideways shiver, a lift, and a stretch.
const IDLE_SWING = {
  cute: { shiver: 0, lift: -0.015, stretch: 1.025 },
  sick: { shiver: 0.006, lift: 0, stretch: 1 },
  fading: { shiver: 0, lift: 0, stretch: 1.012 },
} as const;

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
 * A hatched pet as its Grok picture in its pet color. A healthy pet breathes and blinks (an
 * eyes-closed copy of the same picture flashes on top), a sick one shows its sick picture and
 * shivers, and a fading one shows its fading picture and barely breathes. A tap answers by mood with motion, a burst,
 * the species' voice, and a buzz; five quick taps make a healthy pet dance. Petting is local only.
 * Every motion runs on the native driver, and Reduce Motion keeps it still but keeps the voice.
 */
export function PetPicture({ pet, size, accessibilityLabel }: PetPictureProps) {
  const reduceMotion = useReduceMotion();
  const mood = petMood(pet);
  const idle = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const react = useRef(new Animated.Value(0)).current;
  const history = useRef(PET_TAP_HISTORY_START);
  // `id` remounts the burst and restarts the motion on every tap.
  const [tap, setTap] = useState<{ reaction: PetReaction; id: number } | null>(null);

  useEffect(() => warmUpPetVoices(pet.species), [pet.species]);

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

  useEffect(() => {
    react.setValue(0);
    if (!tap || reduceMotion) return;
    Animated.timing(react, {
      toValue: 1,
      duration: PET_REACTION_MOTION[tap.reaction].ms,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [react, reduceMotion, tap]);

  const onPress = () => {
    if (mood === "egg" || pet.stage === "egg") return;
    const result = petTapReaction(mood, history.current, Date.now());
    history.current = result.history;
    playPetReaction(pet.species, pet.stage, result.reaction);
    setTap((last) => ({ reaction: result.reaction, id: (last?.id ?? 0) + 1 }));
  };

  const keyframes = PET_REACTION_MOTION[tap?.reaction ?? "happy"];
  const reacting = (outputRange: number[] | string[]) =>
    react.interpolate({ inputRange: keyframes.at, outputRange });
  const swing = IDLE_SWING[mood === "egg" ? "cute" : mood];
  const along = (from: number, to: number) =>
    idle.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const motion = [
    { translateX: along(-swing.shiver * size, swing.shiver * size) },
    {
      translateY: Animated.add(
        along(0, swing.lift * size),
        reacting(keyframes.hop.map((share) => share * size)),
      ),
    },
    { rotate: reacting(keyframes.tilt.map((degrees) => `${degrees}deg`)) },
    { scaleY: Animated.add(along(1, swing.stretch), reacting(keyframes.squash)) },
  ];
  const look = mood === "sick" || mood === "fading" ? mood : "healthy";
  const picture = { species: pet.species, stage: pet.stage, color: pet.color, size };
  // Explicit sizes, not absoluteFill: Android otherwise draws the picture at its 512px file size.
  const box = { position: "absolute" as const, top: 0, left: 0, width: size, height: size };

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Pets it"
      onPress={onPress}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[box, { transform: motion, transformOrigin: [size / 2, size * 0.95, 0] }]}
      >
        <TintedPetImage {...picture} look={look} style={box} />
        {mood === "cute" ? (
          <Animated.View style={[box, { opacity: blink }]}>
            <TintedPetImage {...picture} look="blink" />
          </Animated.View>
        ) : null}
      </Animated.View>
      {tap && !reduceMotion ? <ReactionBurst key={tap.id} reaction={tap.reaction} /> : null}
    </Pressable>
  );
}
