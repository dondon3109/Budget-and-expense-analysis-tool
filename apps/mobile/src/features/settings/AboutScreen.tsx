import { Linking, StyleSheet, Text, View } from "react-native";

import { appVersionInfo } from "@/config/app-version";
import { UpdateSettingsCard } from "@/features/updates";
import { Card, MenuGroup, MenuRow } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

const CHANGELOG_URL = "https://zoption.site/changelog";

/** Which build is installed, plus the APK updater on sideloaded Android builds. */
export function AboutScreen() {
  const theme = useZoptionTheme();
  const info = appVersionInfo();
  const rows: { label: string; value: string }[] = [
    { label: "Version", value: info.version ?? "Unknown" },
    { label: "Build", value: info.build ?? "Unknown" },
    { label: "Installed from", value: info.source },
  ];

  return (
    <Screen title="About Zoption" showHeading={false}>
      <Card accessibilityLabel="Zoption version">
        <View style={styles.rows}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={[typography.body, { color: theme.colors.textMuted }]}>{row.label}</Text>
              <Text selectable style={[typography.headline, { color: theme.colors.text }]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <MenuGroup>
        <MenuRow
          icon="history"
          title="What's new"
          onPress={() => void Linking.openURL(CHANGELOG_URL)}
        />
      </MenuGroup>
      <UpdateSettingsCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
});
