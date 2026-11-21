import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  emptyMoneyPreferences,
  hasMoneyPreferences,
  type Currency,
  type PetView,
} from "@zoption/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EggPicker } from "@/features/pet/EggPicker";
import { usePetActions } from "@/features/pet/use-pet-actions";
import { GoalChoices } from "@/features/primary-goal/GoalChoices";
import { PreferenceChoices } from "@/features/primary-goal/PreferenceChoices";
import { useGoalActions } from "@/features/primary-goal/use-goal-actions";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { usePetStore } from "@/stores/pet-store";
import { telemetry } from "@/telemetry/telemetry";
import { Button } from "@/ui/components";
import { ThemePicker } from "@/ui/theme-picker";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { SetupDialog, type SetupProgress } from "./SetupDialog";

type StepProps = { progress: SetupProgress; onNext: () => void };

const PET_CHOICES = [
  {
    value: true,
    title: "Yes, give me a pet",
    detail: "Hatch an egg with a 7-day streak, then keep it happy by logging money.",
    icon: "egg-easter",
  },
  {
    value: false,
    title: "No pet for now",
    detail: "You can turn it on later from the pet page.",
    icon: "sleep",
  },
] as const;

/** A pet the user can raise from an egg now; with no pet view (offline) the pet page asks later. */
export function canPickEgg(pet: PetView | null): boolean {
  return pet !== null && pet.species === null && pet.diedAt === null;
}

/**
 * Combined Theme + Streak pet step (matching web's Make it yours). Theme saves on tap; pet choice
 * only calls the Worker when it differs from the current setting and does not lead to the egg step.
 */
export function PersonalizeStep({
  progress,
  wantsPet,
  onWantsPet,
  onNext,
}: StepProps & { wantsPet: boolean; onWantsPet: (wantsPet: boolean) => void }) {
  const theme = useZoptionTheme();
  const pet = usePetStore((state) => state.pet);
  const actions = usePetActions();
  const eggNext = wantsPet && canPickEgg(pet);

  const saveChoice = async () => {
    if (!eggNext && pet && pet.enabled !== wantsPet && !(await actions.setEnabled(wantsPet))) {
      return;
    }
    usePetStore.getState().markIntroduced();
    void telemetry.capture("onboarding_step_completed", { step: "personalize" });
    onNext();
  };

  return (
    <SetupDialog
      progress={progress}
      title="Make it yours"
      description="Pick a look and decide if a streak pet should cheer you on. You can change both anytime."
    >
      <View style={styles.section}>
        <Text style={[typography.label, { color: theme.colors.text }]}>Theme</Text>
        <ThemePicker />
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, { color: theme.colors.text }]}>Streak pet</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Streak pet" style={styles.choices}>
          {PET_CHOICES.map((choice) => {
            const selected = choice.value === wantsPet;
            return (
              <Pressable
                key={choice.title}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                disabled={actions.busy}
                onPress={withTapSound(() => onWantsPet(choice.value))}
                style={[
                  styles.choice,
                  {
                    backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                    borderColor: selected ? theme.colors.brand : theme.colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  name={choice.icon}
                  size={26}
                  color={selected ? theme.colors.brand : theme.colors.textMuted}
                />
                <View style={styles.choiceCopy}>
                  <Text style={[typography.label, { color: theme.colors.text }]}>
                    {choice.title}
                  </Text>
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    {choice.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {actions.error ? <Failure message={actions.error} /> : null}
      <Button loading={actions.busy} disabled={actions.busy} onPress={() => void saveChoice()}>
        {eggNext ? "Pick my egg" : "Start tracking"}
      </Button>
    </SetupDialog>
  );
}

/** The egg, its color, and its name, after a yes to the pet, so nobody leaves setup for it. */
export function EggStep({ progress, onNext }: StepProps) {
  const pet = usePetStore((state) => state.pet);
  const actions = usePetActions();

  const chooseEgg = async (...egg: Parameters<typeof actions.chooseEgg>) => {
    if (pet && !pet.enabled && !(await actions.setEnabled(true))) return;
    if (await actions.chooseEgg(...egg)) {
      void telemetry.capture("onboarding_step_completed", { step: "egg" });
      onNext();
    }
  };

  return (
    <SetupDialog
      progress={progress}
      title="Pick your egg"
      description="Open Zoption seven days in a row and it hatches, then it grows as you log money."
    >
      <EggPicker busy={actions.busy} onChoose={(...egg) => void chooseEgg(...egg)} />
      {actions.error ? <Failure message={actions.error} /> : null}
      {/* The pet page offers the eggs again, so skipping loses nothing. */}
      <Button
        variant="quiet"
        disabled={actions.busy}
        onPress={() => {
          void telemetry.capture("onboarding_step_skipped", { step: "egg" });
          onNext();
        }}
      >
        Pick one later
      </Button>
    </SetupDialog>
  );
}

/** The goals, asked here only while the Worker says none were chosen or skipped. */
export function GoalsStep({ progress, currency, onNext }: StepProps & { currency: Currency }) {
  const profile = useGoalProfileStore((state) => state.profile);
  const actions = useGoalActions();
  return (
    <SetupDialog
      progress={progress}
      title="What brings you to Zoption?"
      description="So we can set up the right starting point for you."
    >
      <GoalChoices
        goals={profile?.goals ?? []}
        currency={currency}
        confirmLabel="Continue"
        otherText={profile?.otherText ?? null}
        disabled={actions.busy}
        onChoose={(choice) =>
          void actions.save(choice).then((saved) => {
            if (saved) {
              void telemetry.capture("onboarding_step_completed", { step: "goal" });
              onNext();
            }
          })
        }
      />
      {actions.error ? <Failure message={actions.error} /> : null}
      {/* Skip always moves on, even offline; the goal prompt asks again on a later launch. */}
      <Button
        variant="quiet"
        onPress={() => {
          void telemetry.capture("onboarding_step_skipped", { step: "goal" });
          void actions.skip().finally(onNext);
        }}
      >
        Skip for now
      </Button>
    </SetupDialog>
  );
}

/**
 * Pay cadence, budgeting style, and spending focus, asked here only while none are saved. Every
 * answer is optional: Continue with nothing picked saves nothing, and Skip always moves on, even
 * offline.
 */
export function PreferencesStep({
  progress,
  currency,
  onNext,
}: StepProps & { currency: Currency }) {
  const actions = useGoalActions();
  return (
    <SetupDialog
      progress={progress}
      title="How do you manage money?"
      description="Zoption uses these to suggest your first steps and tailor what the assistant asks about."
    >
      <PreferenceChoices
        preferences={emptyMoneyPreferences}
        currency={currency}
        confirmLabel="Continue"
        disabled={actions.busy}
        onSave={(preferences) => {
          if (!hasMoneyPreferences(preferences)) {
            void telemetry.capture("onboarding_step_skipped", { step: "preferences" });
            onNext();
            return;
          }
          void actions.savePreferences(preferences).then((saved) => {
            if (saved) {
              void telemetry.capture("onboarding_step_completed", { step: "preferences" });
              onNext();
            }
          });
        }}
      />
      {actions.error ? <Failure message={actions.error} /> : null}
      <Button
        variant="quiet"
        disabled={actions.busy}
        onPress={() => {
          void telemetry.capture("onboarding_step_skipped", { step: "preferences" });
          onNext();
        }}
      >
        Skip for now
      </Button>
    </SetupDialog>
  );
}

/** A step the Worker has locked: what was saved, and where to change it later. */
export function SavedStep({
  progress,
  title,
  value,
  note,
  onNext,
}: StepProps & { title: string; value: string; note: string }) {
  const theme = useZoptionTheme();
  return (
    <SetupDialog progress={progress} icon="check-circle-outline" title={title} description={note}>
      <Text style={[typography.title, styles.saved, { color: theme.colors.text }]}>{value}</Text>
      <Button onPress={onNext}>Continue</Button>
    </SetupDialog>
  );
}

/** Fallback closing card when someone opens `/onboarding` for an already finished workspace. */
export function FinalStep({ progress, onDone }: { progress?: SetupProgress; onDone: () => void }) {
  return (
    <SetupDialog
      progress={progress}
      icon="check-circle-outline"
      title="Thank you for setting up Zoption"
      description="Your private financial workspace is ready. Start by logging an expense with voice, snapping a receipt, or mapping your first bank statement."
    >
      <Button onPress={onDone}>Start tracking</Button>
    </SetupDialog>
  );
}

function Failure({ message }: { message: string }) {
  const theme = useZoptionTheme();
  return (
    <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  choices: { gap: spacing.sm },
  choice: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  choiceCopy: { flex: 1, minWidth: 0, gap: 2 },
  saved: { textAlign: "center" },
});
