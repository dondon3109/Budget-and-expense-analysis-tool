import { Linking, Platform, StyleSheet, Text, View } from "react-native";

import { appVersionInfo } from "@/config/app-version";
import { isPlayDistribution } from "@/config/app-variant";
import { UpdateSettingsCard } from "@/features/updates";
import { Card, MenuGroup, MenuRow } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

const CHANGELOG_URL = "https://zoption.site/changelog";
const PLAY_PACKAGE = "site.zoption.android";

/**
 * Play installs update through the Play Store, so its listing is the update check.
 * `market://` opens the Play Store app; the web listing covers a phone without it.
 */
async function openPlayListing(): Promise<void> {
  try {
    await Linking.openURL(`market://details?id=${PLAY_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`);
  }
}

/** Which build is installed, plus an update check: the Play listing, or the APK updater. */
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
        {Platform.OS === "android" && isPlayDistribution() ? (
          <MenuRow
            icon="update"
            title="Check for updates"
            value="Google Play"
            onPress={() => void openPlayListing()}
          />
        ) : null}
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
