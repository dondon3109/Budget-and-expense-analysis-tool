import {
  eggArt,
  hatchShineLayer,
  PET_HATCH_TAPS,
  type PetColor,
  type PetSpecies,
} from "@zoption/shared";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "@/ui/reduce-motion";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { EggSprite, LayerSvg } from "./EggSprite";
import { playPetHatch, warmUpPetVoices } from "./pet-sounds";

const shineLayer = hatchShineLayer();

/** Light pouring out of the shell, driven by `glow` from 0 (none) to 1 (full). */
function HatchShine({ size, glow }: { size: number; glow: Animated.Value }) {
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: glow,
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.3] }) }],
        },
      ]}
    >
      <LayerSvg layer={shineLayer} size={size} clipId={clipId} />
    </Animated.View>
  );
}

const play = (animation: Animated.CompositeAnimation) =>
  new Promise<void>((resolve) => animation.start(() => resolve()));

function hatchHint(left: number): string {
  if (left === PET_HATCH_TAPS) return "Ready to hatch! Tap the egg.";
  if (left === 0) return "Cracking…";
  return left === 1 ? "1 more tap…" : `${left} more taps…`;
}

interface HatchEggProps {
  species: PetSpecies;
  color: PetColor | null;
  days: number;
  size: number;
  /** Sends the hatch; `beforeShow` runs once the Worker agrees, before the Baby replaces the egg. */
  hatch: (beforeShow: () => Promise<void>) => Promise<boolean>;
}

/**
 * A ready egg the user taps open. Each tap shakes it harder and spreads the cracks; the last tap
 * asks the Worker, and only its answer bursts the shell. Leaving the screen forgets partial taps.
 */
export function HatchEgg({ species, color, days, size, hatch }: HatchEggProps) {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const [taps, setTaps] = useState(0);
  const [failed, setFailed] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => warmUpPetVoices(species), [species]);

  const tap = () => {
    // The last tap is in flight.
    if (taps >= PET_HATCH_TAPS) return;
    const next = taps + 1;
    setTaps(next);
    setFailed(false);
    if (reduceMotion === false) {
      shake.setValue(0);
      void play(
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 80, useNativeDriver: true }),
          Animated.spring(shake, { toValue: 0, friction: 3, tension: 120, useNativeDriver: true }),
        ]),
      );
    }
    if (next < PET_HATCH_TAPS) return;
    void hatch(async () => {
      playPetHatch(species);
      if (reduceMotion !== false) return;
      await play(
        Animated.timing(burst, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );
    }).then((hatched) => {
      if (hatched) return;
      setTaps(0);
      setFailed(true);
    });
  };

  // Each tap swings the egg a little further.
  const swing = 3 + taps * 1.4;
  const left = PET_HATCH_TAPS - taps;
  return (
    <>
      <View style={{ width: size, height: size }}>
        <Animated.View
          style={{
            opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              {
                rotate: shake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [`-${swing}deg`, `${swing}deg`],
                }),
              },
              { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) },
            ],
          }}
        >
          <EggSprite
            art={eggArt(species, days, taps, color ?? "original")}
            size={size}
            accessibilityLabel={`Ready egg. Tap ${left} more times to hatch it.`}
            onPress={tap}
          />
        </Animated.View>
        {reduceMotion === false ? <HatchShine size={size} glow={burst} /> : null}
      </View>
      <Text
        accessibilityRole={failed ? "alert" : undefined}
        style={[
          typography.callout,
          { color: failed ? theme.colors.danger : theme.colors.textMuted },
        ]}
      >
        {failed ? "Couldn't hatch, try again." : hatchHint(left)}
      </Text>
    </>
  );
}

/** Springs a just-hatched Baby out of where the egg burst, as the shell's light fades behind it. */
export function HatchPop({ size, children }: { size: number; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(reduceMotion === false ? 0.3 : 1)).current;
  const glow = useRef(new Animated.Value(reduceMotion === false ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion !== false) {
      pop.setValue(1);
      glow.setValue(0);
      return;
    }
    pop.setValue(0.3);
    glow.setValue(1);
    const anim = Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [glow, pop, reduceMotion]);
  return (
    <View style={{ width: size, height: size }}>
      {reduceMotion === false ? <HatchShine size={size} glow={glow} /> : null}
      <Animated.View style={{ transform: [{ scale: pop }] }}>{children}</Animated.View>
    </View>
  );
}
