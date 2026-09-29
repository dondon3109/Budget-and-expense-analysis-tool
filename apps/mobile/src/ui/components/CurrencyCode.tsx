import { Text } from "react-native";

import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

/** The workspace currency code, as the trailing label of an amount field. */
export function CurrencyCode() {
  const theme = useZoptionTheme();
  const currency = useWorkspaceCurrency();
  return <Text style={[typography.label, { color: theme.colors.textMuted }]}>{currency}</Text>;
}
