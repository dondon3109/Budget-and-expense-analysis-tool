import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export type HomeMenuView = "home" | "remittance";

const OPTIONS: {
  value: HomeMenuView;
  label: string;
  icon: "home-outline" | "cash-fast";
}[] = [
  { value: "home", label: "Home", icon: "home-outline" },
  { value: "remittance", label: "Remittance", icon: "cash-fast" },
];

const BUTTON_SIZE = 44;

// An icon button that opens the view list as an overlay, so opening it never
// moves the page content. The view names appear only inside the list.
export function HomeViewMenu({
  selected,
  onSelect,
}: {
  selected: HomeMenuView;
  onSelect: (view: HomeMenuView) => void;
}) {
  const theme = useZoptionTheme();
  const buttonRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const current = OPTIONS.find((option) => option.value === selected) ?? OPTIONS[0]!;

  // A Modal sits above the scroll view, and Android only delivers touches inside a
  // parent's bounds, so the list is placed from the button's window position.
  const open = () => {
    setVisible(true);
    buttonRef.current?.measureInWindow((x, y, _width, height) => {
      setAnchor({ x, y: y + height + spacing.xs });
    });
  };
  const close = () => setVisible(false);

  return (
    <>
      <Pressable
        ref={buttonRef}
        accessibilityLabel={`${current.label}, change view`}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible }}
        collapsable={false}
        onPress={open}
        style={[
          styles.button,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons color={String(theme.colors.text)} name={current.icon} size={22} />
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={visible}
      >
        <View style={StyleSheet.absoluteFill}>
          {/* A Modal is its own Android window and does not inherit the root StatusBar
              style, so its icons would turn white over a light page. */}
          <StatusBar style={theme.dark ? "light" : "dark"} />
          <Pressable
            accessibilityLabel="Close menu"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.list,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                left: anchor?.x ?? 0,
                top: anchor?.y ?? 0,
              },
            ]}
          >
            {OPTIONS.map((option) => {
              const active = option.value === selected;
              const color = active ? theme.colors.brand : theme.colors.text;
              return (
                <Pressable
                  key={option.value}
                  accessibilityLabel={option.label}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onSelect(option.value);
                    close();
                  }}
                  style={styles.item}
                >
                  <MaterialCommunityIcons color={String(color)} name={option.icon} size={20} />
                  <Text
                    style={[
                      typography.body,
                      styles.itemLabel,
                      { color, fontWeight: active ? "600" : "400" },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {active ? (
                    <MaterialCommunityIcons
                      color={String(theme.colors.brand)}
                      name="check"
                      size={18}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radii.round,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    position: "absolute",
    minWidth: 200,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: spacing.xxs,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  item: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  itemLabel: { flex: 1 },
});
