import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, typography } from "@/ui/tokens";

function TabIcon({
  name,
  activeName,
  focused,
  color,
  size,
}: {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  activeName: keyof typeof MaterialCommunityIcons.glyphMap;
  focused: boolean;
  color?: string | ColorValue;
  size: number;
}) {
  const theme = useZoptionTheme();
  const iconColor = typeof color === "string" ? color : theme.colors.textMuted;
  return (
    <View
      style={[
        styles.iconPill,
        {
          backgroundColor: focused ? theme.colors.brandSoft : "transparent",
        },
      ]}
    >
      <MaterialCommunityIcons
        name={focused ? activeName : name}
        color={focused ? theme.colors.brand : iconColor}
        size={size}
      />
    </View>
  );
}

export default function TabLayout() {
  const theme = useZoptionTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 24 : 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: "600",
          fontSize: 11,
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceRaised,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 54 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              activeName="home-variant"
              color={color}
              focused={focused}
              name="home-variant-outline"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Transactions",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              activeName="swap-vertical-bold"
              color={color}
              focused={focused}
              name="swap-vertical"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: "Budgets",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              activeName="chart-donut"
              color={color}
              focused={focused}
              name="chart-donut-variant"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              activeName="dots-horizontal-circle"
              color={color}
              focused={focused}
              name="dots-horizontal-circle-outline"
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    width: 44,
    height: 28,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
