import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { FAMILY_SEAT_LIMIT } from "@zoption/shared";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getFamilyDetail } from "@/api/family";
import { withTapSound } from "@/features/sounds/sound-effects";
import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { useFamilyApi } from "./use-family-api";

// Shared by the family Home and Family settings, so dismissing it on one hides it on both.
// SecureStore keys allow only letters, digits, ".", "-", and "_".
const dismissedKey = (familyId: string) => `zoption.family-just-you.${familyId}`;

/**
 * Tells the owner of an unpaid family that it is theirs alone until a family plan pays for it.
 * The caller decides when it applies; the person decides when they have read it.
 */
export function JustYouCard({ familyId, onPlanPage }: { familyId: string; onPlanPage: boolean }) {
  const theme = useZoptionTheme();
  // Hidden until the stored choice is read, so a dismissed card never flashes.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(dismissedKey(familyId))
      .then((value) => {
        if (active) setDismissed(value === "1");
      })
      .catch(() => {
        if (active) setDismissed(false);
      });
    return () => {
      active = false;
    };
  }, [familyId]);

  if (dismissed !== false) return null;

  const dismiss = () => {
    setDismissed(true);
    // A failed write only brings the card back next time.
    void SecureStore.setItemAsync(dismissedKey(familyId), "1").catch(() => undefined);
  };

  return (
    <Card accessibilityLabel="Just you for now">
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>Just you for now</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Try the family on your own with Free limits. A family plan lets you invite up to{" "}
            {FAMILY_SEAT_LIMIT - 1} people, and everyone gets the plan for their own Zoption too.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          hitSlop={8}
          onPress={withTapSound(dismiss)}
        >
          <MaterialCommunityIcons color={theme.colors.textMuted} name="close" size={20} />
        </Pressable>
      </View>
      {onPlanPage ? null : (
        <Button onPress={() => router.push("/(app)/family")} size="compact" variant="secondary">
          See family plans
        </Button>
      )}
    </Card>
  );
}

/** Home's copy of the card: shown to the owner of the family shown while it has no plan. */
export function FamilyHomeJustYouCard() {
  const { family } = useActiveWorkspace();
  const familyApi = useFamilyApi();
  const owner = family?.role === "owner";
  const [unpaidFamily, setUnpaidFamily] = useState<string | null>(null);

  useEffect(() => {
    if (!familyApi || !owner) return;
    let active = true;
    // Online only; offline the card simply stays away.
    familyApi(getFamilyDetail)
      .then((detail) => {
        if (active) setUnpaidFamily(detail.plan === "unpaid" ? detail.id : null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [familyApi, owner]);

  if (!family || !owner || unpaidFamily !== family.id) return null;
  return <JustYouCard familyId={family.id} onPlanPage={false} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  text: { flex: 1, gap: spacing.xxs },
});
