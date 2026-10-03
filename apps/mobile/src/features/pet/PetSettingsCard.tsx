import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { setPetEnabled } from "@/api/pet";
import { useSessionSnapshot } from "@/auth/session-state";
import { usePetStore } from "@/stores/pet-store";
import { CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, touchTarget, typography } from "@/ui/tokens";

/** Turns the pet companion on or off. Hidden until the Worker has answered, as for guests. */
export function PetSettingsCard() {
  const theme = useZoptionTheme();
  const { getAccessToken } = useSessionSnapshot();
  const pet = usePetStore((state) => state.pet);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!pet) return null;

  const toggle = async (enabled: boolean) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const accessToken = await getAccessToken(false);
      usePetStore.getState().setPet(await setPetEnabled({ accessToken }, enabled));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <CollapsibleCard title="Pet companion" summary={pet.enabled ? "On" : "Off"} icon="paw-outline">
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Your pet grows as you log money every day. Turning it off hides it, stops its alerts, and
        pauses its health, so it never gets sick while it is off.
      </Text>
      <View style={styles.option}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Show my pet</Text>
        <Switch
          accessibilityLabel="Show my pet"
          disabled={pending}
          value={pet.enabled}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        />
      </View>
      {failed ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          Zoption couldn&apos;t update your pet. Check your connection and try again.
        </Text>
      ) : null}
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
