import type { FamilyMember, FamilySharedBalance } from "@zoption/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { getFamilyDetail, getFamilySharedBalances, removeFamilySharedBalance } from "@/api/family";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, Card, formatMoneyMinor } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { formatFamilyDate, memberLabel, useFamilyApi } from "./use-family-api";

/**
 * Personal balances members chose to show the family, beside the family's own accounts and never
 * inside "Left". They are read live from each person's account, so the card needs a connection
 * and simply stays away offline.
 */
export function SharedBalancesCard() {
  const theme = useZoptionTheme();
  const me = useSessionSnapshot().subject;
  const owner = useActiveWorkspace().family?.role === "owner";
  const familyApi = useFamilyApi();
  const [balances, setBalances] = useState<FamilySharedBalance[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!familyApi) return;
    let live = true;
    void familyApi((api) => Promise.all([getFamilySharedBalances(api), getFamilyDetail(api)]))
      .then(([loaded, detail]) => {
        if (!live) return;
        setBalances(loaded);
        setMembers(detail.members);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [familyApi]);

  if (!familyApi || balances.length === 0) return null;
  const muted = { color: theme.colors.textMuted };

  const remove = async (shareId: string) => {
    setMessage(null);
    try {
      await familyApi((api) => removeFamilySharedBalance(api, shareId));
      setBalances((current) => current.filter((item) => item.id !== shareId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The balance could not be removed.");
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={[typography.headline, { color: theme.colors.text }]}>Shared balances</Text>
      <Text style={[typography.callout, muted]}>
        Members&apos; own accounts, shown here by choice. Not counted in the family total.
      </Text>
      {balances.map((balance) => (
        <View key={balance.id} className="flex-row items-center gap-3">
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { color: theme.colors.text }]}>
              {balance.accountName}
            </Text>
            <Text style={[typography.callout, muted]}>
              {memberLabel(balance.sharedByUserId, me, members)}
              {balance.stoppedAt ? ` · stopped sharing ${formatFamilyDate(balance.stoppedAt)}` : ""}
            </Text>
          </View>
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            {formatMoneyMinor(balance.balanceMinor, balance.currency)}
          </Text>
          {owner ? (
            <Button
              accessibilityLabel={`Remove ${balance.accountName} from the family`}
              icon="close"
              onPress={() => void remove(balance.id)}
              size="compact"
              variant="quiet"
            />
          ) : null}
        </View>
      ))}
      {message ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}
    </Card>
  );
}
