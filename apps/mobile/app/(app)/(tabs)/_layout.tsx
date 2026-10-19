import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import {
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ColorValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { playSound } from "@/features/sounds/sound-effects";
import { useReduceMotion } from "@/ui/reduce-motion";
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
  // The current tab sits in a solid pill, the same marker the web tab bar uses. The pill fills
  // the icon slot, which tabBarIconStyle sizes to PILL; the default slot is only as big as the
  // glyph, so a larger pill would be clipped and pushed off-center.
  return (
    <View
      style={[styles.iconPill, { backgroundColor: focused ? theme.colors.solid : "transparent" }]}
    >
      <MaterialCommunityIcons
        name={focused ? activeName : name}
        color={focused ? theme.colors.onSolid : iconColor}
        size={Math.min(size, 22)}
      />
    </View>
  );
}

const PILL = { width: 52, height: 28 } as const;

const styles = StyleSheet.create({
  iconPill: {
    ...PILL,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
});

export default function TabLayout() {
  const theme = useZoptionTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 24 : 12);

  return (
    <Tabs
      screenListeners={{ tabPress: () => playSound("tap") }}
      screenOptions={{
        headerShown: false,
        // Tabs slide like pages: a tab's progress is -1 left of the focused one and 1 right of
        // it, so the incoming page pushes the outgoing one off the side it came from. A custom
        // spec animates even with animation "none", so reduce motion leaves all three out.
        ...(reduceMotion
          ? {}
          : {
              animation: "shift",
              transitionSpec: {
                animation: "timing",
                config: { duration: 280, easing: Easing.out(Easing.cubic) },
              },
              sceneStyleInterpolator: ({ current }) => ({
                sceneStyle: {
                  transform: [
                    {
                      translateX: current.progress.interpolate({
                        inputRange: [-1, 0, 1],
                        outputRange: [-width, 0, width],
                      }),
                    },
                  ],
                },
              }),
            }),
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarIconStyle: PILL,
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
              activeName="dots-horizontal"
              color={color}
              focused={focused}
              name="dots-horizontal"
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
