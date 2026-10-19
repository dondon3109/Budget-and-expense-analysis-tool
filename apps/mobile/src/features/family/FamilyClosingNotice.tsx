import { Text } from "react-native";

import { Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { formatFamilyDate } from "./use-family-api";

/** Home's notice that the family shown is closing, which is why nothing in it can change. */
export function FamilyClosingNotice() {
  const theme = useZoptionTheme();
  const { closesAt } = useActiveWorkspace();
  if (!closesAt) return null;
  return (
    <Card>
      <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.text }]}>
        This family closes on {formatFamilyDate(closesAt)}. You can view it until then, but nothing
        in it can change.
      </Text>
    </Card>
  );
}
