import type { Currency } from "@zoption/shared";
import { Text } from "react-native";

import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

/** A currency code (the workspace currency by default), as the trailing label of an amount field. */
export function CurrencyCode({ code }: { code?: Currency }) {
  const theme = useZoptionTheme();
  const workspaceCurrency = useWorkspaceCurrency();
  const currency = code ?? workspaceCurrency;
  return <Text style={[typography.label, { color: theme.colors.textMuted }]}>{currency}</Text>;
}
