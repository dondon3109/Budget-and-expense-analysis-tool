import { preferredTransactionAccount } from "@zoption/shared";
import { Text, View } from "react-native";

import { useTransactionFormData } from "@/db/local-workspace-state";
import { useDefaultSpendingAccountStore } from "@/stores/default-spending-account-store";
import { Card, SelectionField, SkeletonLines } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export function DefaultSpendingAccountCard() {
  const theme = useZoptionTheme();
  const formData = useTransactionFormData();
  const accountId = useDefaultSpendingAccountStore((state) => state.accountId);
  const setAccountId = useDefaultSpendingAccountStore((state) => state.setAccountId);
  const accounts = formData.data?.accounts ?? [];
  const selected = preferredTransactionAccount(accounts, accountId);

  return (
    <Card accessibilityLabel="Default spending account">
      <View className="gap-2">
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          Default spending account
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          New transactions, receipt scans, and the mic widget start on this account. Without a
          choice, Cash is picked first. This device remembers the choice; other devices keep their
          own.
        </Text>
        {formData.data ? (
          <SelectionField
            label="Account"
            value={selected?.id ?? ""}
            options={accounts.map((account) => ({
              id: account.id,
              label: account.name,
              detail: account.currency,
            }))}
            placeholder="Choose an account"
            sheetTitle="Default spending account"
            disabled={accounts.length === 0}
            onSelect={setAccountId}
          />
        ) : formData.error ? (
          <Text style={[typography.caption, { color: theme.colors.danger }]}>{formData.error}</Text>
        ) : (
          <SkeletonLines lines={1} />
        )}
      </View>
    </Card>
  );
}
