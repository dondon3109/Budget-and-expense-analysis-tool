import {
  PET_DAILY_POINT_CEILING,
  PET_STAGE_THRESHOLDS,
  eggArt,
  petEggProgressLine,
  petGrowthLockedLine,
  petHealthHint,
  petSpeciesLabels,
  petStageLabels,
  tombstoneArt,
  type PetView,
} from "@zoption/shared";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { usePlan } from "@/auth/plan-state";
import { usePetStore } from "@/stores/pet-store";
import { Button, Card } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { EggPicker } from "./EggPicker";
import { HatchEgg, HatchPop } from "./HatchEgg";
import { PetColorCatchUp } from "./PetColorCatchUp";
import { PetColorPicker } from "./PetColorPicker";
import { EggSprite } from "./EggSprite";
import { PetArtSvg } from "./PetArtSvg";
import { PetPicture } from "./PetPicture";
import {
  EarnTiles,
  GrowthPath,
  PetChips,
  PetSpotlight,
  healthTone,
  useToneColors,
} from "./PetPlayground";
import { usePetActions } from "./use-pet-actions";

function Meter({
  label,
  icon,
  value,
  max,
  color,
}: {
  label: string;
  icon: string;
  value: number;
  max: number;
  color: string;
}) {
  const theme = useZoptionTheme();
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 1;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{ gap: spacing.xxs }}
    >
      <Text style={[typography.label, { color: theme.colors.text }]}>
        {icon} {label}
      </Text>
      <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function HatchedPet({ pet }: { pet: PetView & { species: NonNullable<PetView["species"]> } }) {
  const theme = useZoptionTheme();
  const tones = useToneColors();
  const planState = usePlan();
  const stageStart = pet.stage === "egg" ? 0 : PET_STAGE_THRESHOLDS[pet.stage];
  // Only once the plan is known, so a paid user never sees the lock while it loads.
  const lockedLine =
    planState.status === "ready" && planState.plan === "free" ? petGrowthLockedLine(pet) : null;
  const healthHint = petHealthHint(pet);
  const unwell = pet.healthState === "sick" || pet.healthState === "fading";
  return (
    <>
      {pet.nextStagePoints === null ? (
        <Text style={[typography.body, { color: theme.colors.text }]}>
          {pet.points} points. Your pet is fully grown.
        </Text>
      ) : (
        <Meter
          label={`${pet.points} of ${pet.nextStagePoints} points to grow`}
          icon="🌱"
          value={pet.points - stageStart}
          max={pet.nextStagePoints - stageStart}
          color={tones.brand.fill}
        />
      )}
      {lockedLine ? (
        <>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>{lockedLine}</Text>
          <Button variant="secondary" onPress={() => router.push("/(app)/plan-billing")}>
            See paid plans
          </Button>
        </>
      ) : null}
      <Meter
        label={`Health ${pet.health ?? 0} of 100`}
        icon="❤️"
        value={pet.health ?? 0}
        max={100}
        color={tones[healthTone(pet.healthState)].fill}
      />
      {healthHint ? (
        <Text
          accessibilityRole={unwell ? "alert" : undefined}
          style={[
            typography.callout,
            { color: unwell ? theme.colors.danger : theme.colors.textMuted },
          ]}
        >
          {healthHint}
        </Text>
      ) : null}
      <Meter
        label={`Today ${pet.pointsToday} of ${PET_DAILY_POINT_CEILING} points`}
        icon="☀️"
        value={pet.pointsToday}
        max={PET_DAILY_POINT_CEILING}
        color={tones.sun.fill}
      />
    </>
  );
}

/** The pet companion: pick an egg, tap it open, and see how to keep it growing. */
export function PetScreen() {
  const theme = useZoptionTheme();
  const pet = usePetStore((state) => state.pet);
  const actions = usePetActions();
  const { refresh } = actions;
  const [justHatched, setJustHatched] = useState(false);
  const window = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!pet) {
    return (
      <Screen hasHeader title="Your pet">
        <Stack.Screen options={{ title: "Your pet" }} />
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          {actions.refreshing || actions.busy
            ? "Finding your pet…"
            : "Connect to the internet to see your pet."}
        </Text>
        {actions.error ? (
          <>
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {actions.error}
            </Text>
            <Button onPress={() => void refresh()}>Try again</Button>
          </>
        ) : null}
      </Screen>
    );
  }

  if (!pet.enabled) {
    return (
      <Screen hasHeader title="Your pet">
        <Stack.Screen options={{ title: "Your pet" }} />
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Your pet companion is turned off. Turn it on to raise a pet as you log money every day.
        </Text>
        <Button loading={actions.busy} onPress={() => void actions.setEnabled(true)}>
          Turn on my pet
        </Button>
        {actions.error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            {actions.error}
          </Text>
        ) : null}
      </Screen>
    );
  }

  if (pet.species === null) {
    const title = pet.diedAt ? "Pick a new egg" : "Meet your pet";
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Screen
          hasHeader
          title={title}
          description={
            pet.diedAt
              ? "Every egg starts fresh. Open Zoption seven days in a row to hatch your next companion."
              : "Pick an egg. Open Zoption seven days in a row and it is ready to hatch, then it grows as you log money."
          }
        >
          <Stack.Screen options={{ title }} />
          {pet.diedAt ? (
            <Card style={styles.memorial}>
              <PetArtSvg layers={tombstoneArt()} size={64} idBase="petMemorialStone" />
              <View style={styles.memorialCopy}>
                <Text style={[typography.headline, { color: theme.colors.text }]}>
                  {pet.name ?? "Your last pet"} passed away
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {new Date(pet.diedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · Three days went by with nothing logged.
                </Text>
              </View>
            </Card>
          ) : null}
          <EggPicker
            busy={actions.busy}
            onChoose={(species, name, color) => void actions.chooseEgg(species, name, color)}
          />
          {pet.diedAt ? null : (
            <Button
              variant="secondary"
              disabled={actions.busy}
              onPress={() =>
                void actions.setEnabled(false).then((saved) => {
                  if (saved) router.back();
                })
              }
            >
              Not now
            </Button>
          )}
          {actions.error ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {actions.error}
            </Text>
          ) : null}
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  const kind = `${petSpeciesLabels[pet.species]} · ${petStageLabels[pet.stage]}`;
  const name = pet.name ?? petSpeciesLabels[pet.species];
  const ready = pet.stage === "egg" && pet.eggStreakDays >= pet.eggHatchDays;
  // Leaves room for the spotlight, name, and meters on a small phone without scrolling.
  const size = Math.round(Math.min(200, window.width * 0.5, window.height * 0.24));
  const sprite =
    pet.stage === "egg" ? (
      <EggSprite
        art={eggArt(pet.species, pet.eggStreakDays, 0, pet.color ?? "original")}
        size={size}
        accessibilityLabel={`${name}, ${kind}`}
      />
    ) : (
      <PetPicture
        pet={{ ...pet, species: pet.species }}
        size={size}
        accessibilityLabel={`${name}, ${kind}`}
      />
    );

  return (
    <Screen
      hasHeader
      title="Your pet"
      refreshing={actions.refreshing}
      onRefresh={() => refresh().then(() => undefined)}
    >
      <Stack.Screen options={{ title: "Your pet" }} />
      {pet.color === null ? (
        <PetColorCatchUp
          pet={{ ...pet, species: pet.species }}
          name={name}
          busy={actions.busy}
          error={actions.error}
          onPick={(color) => void actions.setColor(color)}
        />
      ) : null}
      {/* The pet stands on the page itself, not in a card. */}
      <View style={{ alignItems: "center", gap: spacing.md }}>
        <PetSpotlight size={size}>
          {ready ? (
            <HatchEgg
              species={pet.species}
              color={pet.color}
              days={pet.eggStreakDays}
              size={size}
              hatch={(beforeShow) =>
                actions.hatch(async () => {
                  await beforeShow();
                  setJustHatched(true);
                })
              }
            />
          ) : justHatched ? (
            <HatchPop size={size}>{sprite}</HatchPop>
          ) : (
            sprite
          )}
        </PetSpotlight>
        <View style={{ alignItems: "center" }}>
          <Text style={[typography.display, { color: theme.colors.text }]}>{name}</Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>{kind}</Text>
          {pet.stage !== "egg" ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Tap to pet · 5 quick taps to dance
            </Text>
          ) : null}
        </View>
        <PetChips pet={pet} />
        <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
          {ready ? null : pet.stage === "egg" ? (
            <>
              <Meter
                label={`Day ${pet.eggStreakDays} of ${pet.eggHatchDays}`}
                icon="🥚"
                value={pet.eggStreakDays}
                max={pet.eggHatchDays}
                color={String(theme.colors.warning)}
              />
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                {petEggProgressLine(pet)}
              </Text>
            </>
          ) : (
            <HatchedPet pet={{ ...pet, species: pet.species }} />
          )}
        </View>
        <GrowthPath stage={pet.stage} />
        {pet.color === null ? null : (
          <PetColorPicker
            label="Color"
            value={pet.color}
            disabled={actions.busy}
            onChange={(color) => void actions.setColor(color)}
          />
        )}
      </View>
      {actions.error && pet.color !== null ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {actions.error}
        </Text>
      ) : null}
      <EarnTiles />
      <Button
        variant="secondary"
        disabled={actions.busy}
        onPress={() => void actions.setEnabled(false)}
      >
        Turn off my pet
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 14, borderRadius: radii.round, overflow: "hidden" },
  fill: { height: 14, minWidth: 14, borderRadius: radii.round },
  memorial: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  memorialCopy: { flex: 1, minWidth: 0, gap: 2 },
});
