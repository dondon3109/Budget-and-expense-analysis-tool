import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { MenuIcon, menuRowStyles } from "./MenuGroup";

interface CollapsibleCardProps extends PropsWithChildren {
  title: string;
  /** The current value, shown beside the title so a folded row still answers "what is set". */
  summary: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

/**
 * A settings row that folds to one line and looks like a MenuRow; its content renders only
 * while expanded. Place it inside a MenuGroup, which supplies the card and dividers.
 */
export function CollapsibleCard({ title, summary, icon, children }: CollapsibleCardProps) {
  const theme = useZoptionTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${summary}`}
        accessibilityState={{ expanded }}
        className="w-full"
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={menuRowStyles.row}>
          <MenuIcon icon={icon} />
          <Text style={[typography.headline, styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[typography.callout, { color: theme.colors.textMuted }]}>
            {summary}
          </Text>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.colors.textMuted}
          />
        </View>
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, minWidth: 0 },
  body: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
