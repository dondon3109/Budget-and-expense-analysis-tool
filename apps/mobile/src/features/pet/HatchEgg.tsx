import { eggArt, PET_HATCH_TAPS, type PetSpecies } from "@zoption/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Text, Vibration } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { PetSprite } from "./PetSprite";

const play = (animation: Animated.CompositeAnimation) =>
  new Promise<void>((resolve) => animation.start(() => resolve()));

function hatchHint(left: number): string {
  if (left === PET_HATCH_TAPS)
    return `Ready to hatch! Tap the egg ${PET_HATCH_TAPS} times to crack it open.`;
  if (left === 0) return "Cracking…";
  return left === 1 ? "1 more tap…" : `${left} more taps…`;
}

interface HatchEggProps {
  species: PetSpecies;
  days: number;
  size: number;
  /** Sends the hatch; `beforeShow` runs once the Worker agrees, before the Baby replaces the egg. */
  hatch: (beforeShow: () => Promise<void>) => Promise<boolean>;
}

/**
 * A ready egg the user taps open. Each tap shakes it harder and spreads the cracks; the last tap
 * asks the Worker, and only its answer bursts the shell. Leaving the screen forgets partial taps.
 */
export function HatchEgg({ species, days, size, hatch }: HatchEggProps) {
  const theme = useZoptionTheme();
  const [taps, setTaps] = useState(0);
  const [failed, setFailed] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  const tap = () => {
    // The last tap is in flight.
    if (taps >= PET_HATCH_TAPS) return;
    const next = taps + 1;
    setTaps(next);
    setFailed(false);
    Vibration.vibrate(next === PET_HATCH_TAPS ? 80 : 12);
    shake.setValue(0);
    void play(
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.spring(shake, { toValue: 0, friction: 3, tension: 120, useNativeDriver: true }),
      ]),
    );
    if (next < PET_HATCH_TAPS) return;
    void hatch(() =>
      play(
        Animated.timing(burst, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).then((hatched) => {
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
        <PetSprite
          art={eggArt(species, days, taps)}
          mood="egg"
          size={size}
          accessibilityLabel={`Ready egg. Tap ${left} more times to hatch it.`}
          onPress={tap}
        />
      </Animated.View>
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

/** Springs a just-hatched Baby out of where the egg burst. */
export function HatchPop({ children }: { children: ReactNode }) {
  const pop = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [pop]);
  return <Animated.View style={{ transform: [{ scale: pop }] }}>{children}</Animated.View>;
}
