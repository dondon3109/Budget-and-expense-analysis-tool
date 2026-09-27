import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text, View } from "react-native";

import { Button, ErrorState } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

const CONSENT_POINTS = [
  {
    icon: "format-list-bulleted",
    title: "You review every entry",
    text: "Zoption shows every drafted receipt line, PDF transaction, or spoken entry before anything is saved.",
  },
  {
    icon: "delete-outline",
    title: "Source files are never stored",
    text: "Your photo, PDF, or recording is used only during the request that reads it and is then discarded.",
  },
  {
    icon: "eye-outline",
    title: "Stays off until you accept",
    text: "AI-assisted entry never runs in the background. Manual entry remains available.",
  },
] as const;

/** The one-time notice the user accepts before receipt scanning is enabled for the account. */
export function ReceiptConsent({
  busy,
  error,
  onAccept,
}: {
  busy: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="w-full gap-5 py-2">
      <View className="gap-2">
        <Text style={[typography.title, { color: theme.colors.text }]}>
          Review first. Save only when it is right.
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Zoption sends only the photo, PDF, or recording you choose to AI during that request. It
          drafts editable entries; you remain in control of every transaction.
        </Text>
      </View>
      <View className="w-full gap-4">
        {CONSENT_POINTS.map((point) => (
          <View key={point.title} className="w-full flex-row items-start gap-3">
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.brand}
              name={point.icon}
              size={21}
              style={{ marginTop: 1 }}
            />
            <View className="min-w-0 flex-1 gap-1">
              <Text style={[typography.label, { color: theme.colors.text }]}>{point.title}</Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                {point.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        AI can misread printed text. Check item amounts and the receipt total before saving.
      </Text>
      <Button
        accessibilityLabel="Accept and enable receipt scanning"
        loading={busy}
        onPress={onAccept}
      >
        Accept and enable receipt scanning
      </Button>
      {error ? <ErrorState title="Receipt scanning could not be enabled" message={error} /> : null}
    </View>
  );
}
