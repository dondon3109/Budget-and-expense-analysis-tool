import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { playSound } from "@/features/sounds/sound-effects";
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
        onPress={() => {
          playSound("tap");
          setExpanded((current) => !current);
        }}
      >
        <View style={menuRowStyles.row}>
          <MenuIcon icon={icon} />
          <Text style={[typography.headline, styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[typography.callout, styles.summary, { color: theme.colors.textMuted }]}
          >
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
  // The title keeps its full width; a long summary is what yields and truncates. Letting the
  // title shrink instead wrapped "Your goal" one character per line beside a long goal label.
  title: { flexGrow: 1, flexShrink: 0 },
  summary: { flexShrink: 1, minWidth: 0, textAlign: "right" },
  body: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
