import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { PetView } from "@zoption/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EggPicker } from "@/features/pet/EggPicker";
import { usePetActions } from "@/features/pet/use-pet-actions";
import { GoalChoices } from "@/features/primary-goal/GoalChoices";
import { useGoalActions } from "@/features/primary-goal/use-goal-actions";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { usePetStore } from "@/stores/pet-store";
import { Button } from "@/ui/components";
import { ThemePicker } from "@/ui/theme-picker";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { SetupDialog, type SetupProgress } from "./SetupDialog";

type StepProps = { progress: SetupProgress; onNext: () => void };

/** Theme, saved on the device as soon as it is tapped. */
export function ThemeStep({ progress, onNext }: StepProps) {
  return (
    <SetupDialog
      progress={progress}
      title="Pick a look"
      description="Choose how Zoption looks. You can change it anytime in More."
    >
      <ThemePicker />
      <Button onPress={onNext}>Continue</Button>
    </SetupDialog>
  );
}

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
 * Whether a streak pet should cheer the user on. The choice is lifted so the step track can show
 * or drop the egg step as it changes. A yes that leads to the egg step saves nothing yet; any
 * other answer is saved on the Worker only when it changes the setting.
 */
export function PetStep({
  progress,
  wantsPet,
  onWantsPet,
  onNext,
}: StepProps & { wantsPet: boolean; onWantsPet: (wantsPet: boolean) => void }) {
  const theme = useZoptionTheme();
  const pet = usePetStore((state) => state.pet);
  const actions = usePetActions();

  const saveChoice = async () => {
    const eggNext = wantsPet && canPickEgg(pet);
    if (!eggNext && pet && pet.enabled !== wantsPet && !(await actions.setEnabled(wantsPet))) {
      return;
    }
    usePetStore.getState().markIntroduced();
    onNext();
  };

  return (
    <SetupDialog
      progress={progress}
      title="Want a streak pet?"
      description="A pet that grows as you keep logging. You can change this anytime."
    >
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
                <Text style={[typography.label, { color: theme.colors.text }]}>{choice.title}</Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {choice.detail}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {actions.error ? <Failure message={actions.error} /> : null}
      <Button loading={actions.busy} disabled={actions.busy} onPress={() => void saveChoice()}>
        Continue
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
    if (await actions.chooseEgg(...egg)) onNext();
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
      <Button variant="quiet" disabled={actions.busy} onPress={onNext}>
        Pick one later
      </Button>
    </SetupDialog>
  );
}

/** The goals, asked here only while the Worker says none were chosen or skipped. */
export function GoalsStep({ progress, onNext }: StepProps) {
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
        confirmLabel="Continue"
        otherText={profile?.otherText ?? null}
        disabled={actions.busy}
        onChoose={(choice) => void actions.save(choice).then((saved) => saved && onNext())}
      />
      {actions.error ? <Failure message={actions.error} /> : null}
      {/* Skip always moves on, even offline; the goal prompt asks again on a later launch. */}
      <Button variant="quiet" onPress={() => void actions.skip().finally(onNext)}>
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

/** The thank-you that closes setup. Without `progress` it stands alone, for a finished workspace. */
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
