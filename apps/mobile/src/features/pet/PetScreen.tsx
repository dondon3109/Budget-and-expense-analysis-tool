import { PET_DAILY_POINT_CEILING, PET_STAGE_THRESHOLDS, type PetView } from "@zoption/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePetStore } from "@/stores/pet-store";
import { Button, Card } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { petArt } from "./art";
import { EggPicker } from "./EggPicker";
import { petEarningRows, petMood, petSpeciesLabels, petStageLabels } from "./pet-labels";
import { PetSprite } from "./PetSprite";
import { usePetActions } from "./use-pet-actions";

function Meter({
  label,
  value,
  max,
  color,
}: {
  label: string;
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
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: theme.colors.canvasMuted }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function HatchedPet({ pet }: { pet: PetView & { species: NonNullable<PetView["species"]> } }) {
  const theme = useZoptionTheme();
  const stageStart = pet.stage === "egg" ? 0 : PET_STAGE_THRESHOLDS[pet.stage];
  const healthColor =
    pet.healthState === "healthy"
      ? String(theme.colors.income)
      : pet.healthState === "sick"
        ? String(theme.colors.warning)
        : String(theme.colors.danger);
  return (
    <>
      {pet.nextStagePoints === null ? (
        <Text style={[typography.body, { color: theme.colors.text }]}>
          {pet.points} points. Your pet is fully grown.
        </Text>
      ) : (
        <Meter
          label={`${pet.points} of ${pet.nextStagePoints} points to grow`}
          value={pet.points - stageStart}
          max={pet.nextStagePoints - stageStart}
          color={String(theme.colors.brand)}
        />
      )}
      <Meter
        label={`Health ${pet.health ?? 0} of 100`}
        value={pet.health ?? 0}
        max={100}
        color={healthColor}
      />
      <Meter
        label={`Today ${pet.pointsToday} of ${PET_DAILY_POINT_CEILING} points`}
        value={pet.pointsToday}
        max={PET_DAILY_POINT_CEILING}
        color={String(theme.colors.mint)}
      />
      {pet.healthState === "sick" || pet.healthState === "fading" ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {pet.healthState === "sick"
            ? "Your pet is sick. Log something today and it will eat points to heal."
            : "Your pet is fading. If nothing is logged within 72 hours of the last activity, it passes away."}
        </Text>
      ) : null}
    </>
  );
}

/** The pet companion: pick an egg, watch it hatch, and see how to keep it growing. */
export function PetScreen() {
  const theme = useZoptionTheme();
  const pet = usePetStore((state) => state.pet);
  const actions = usePetActions();
  const { refresh } = actions;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!pet) {
    return (
      <Screen title="Your pet">
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          {actions.busy ? "Finding your pet…" : "Connect to the internet to see your pet."}
        </Text>
        {actions.error ? <Button onPress={() => void refresh()}>Try again</Button> : null}
      </Screen>
    );
  }

  if (!pet.enabled) {
    return (
      <Screen title="Your pet">
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Your pet companion is turned off. Turn it on to raise a pet as you log money every day.
        </Text>
        <Button loading={actions.busy} onPress={() => void actions.setEnabled(true)}>
          Turn on my pet
        </Button>
      </Screen>
    );
  }

  if (pet.species === null) {
    const choose = async (species: Parameters<typeof actions.chooseEgg>[0]) => {
      await actions.chooseEgg(species);
    };
    return (
      <Screen
        title={pet.diedAt ? "Pick a new egg" : "Meet your pet"}
        description={
          pet.diedAt
            ? "Your last pet passed away after three days with nothing logged. Every egg starts fresh."
            : "Pick an egg. Open Zoption seven days in a row and it hatches, then it grows as you log money."
        }
      >
        <EggPicker busy={actions.busy} onChoose={(species) => void choose(species)} />
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
    );
  }

  const name = `${petSpeciesLabels[pet.species]} · ${petStageLabels[pet.stage]}`;
  return (
    <Screen title="Your pet" onRefresh={() => refresh().then(() => undefined)}>
      <Card style={{ alignItems: "center", gap: spacing.md }}>
        <PetSprite
          art={petArt(pet.species, pet.stage, pet.eggStreakDays)}
          mood={petMood(pet)}
          size={220}
          accessibilityLabel={name}
        />
        <Text style={[typography.title, { color: theme.colors.text }]}>{name}</Text>
        <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
          {pet.stage === "egg" ? (
            <>
              <Meter
                label={`Day ${pet.eggStreakDays} of ${pet.eggHatchDays}`}
                value={pet.eggStreakDays}
                max={pet.eggHatchDays}
                color={String(theme.colors.brand)}
              />
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Open Zoption every day to hatch it. Missing a day starts the count over.
              </Text>
            </>
          ) : (
            <HatchedPet pet={{ ...pet, species: pet.species }} />
          )}
        </View>
      </Card>
      <Card>
        <Text style={[typography.headline, { color: theme.colors.text }]}>How to earn points</Text>
        {petEarningRows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={[typography.callout, { color: theme.colors.text }]}>{row.label}</Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {row.rule.points} pts, {row.rule.dailyCount}× a day
            </Text>
          </View>
        ))}
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Doing three different things in a day adds a 10 point bonus. A day earns at most{" "}
          {PET_DAILY_POINT_CEILING} points.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radii.round, overflow: "hidden" },
  fill: { height: 8, borderRadius: radii.round },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
});
