import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNetInfo } from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useActiveWorkspace } from "@/features/family/active-workspace";
import { ROLE_LABELS } from "@/features/family/use-family-api";
import { familyOpenable } from "@/features/family/workspace-record";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

/** What Home shows below the menu: the workspace's dashboard or the remittance calculator. */
export type HomeMenuView = "home" | "remittance";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Home's one way to say where you are and go elsewhere: a compact button beside the Overview and
 * Analytics tabs whose icon says personal or family, and whose list names the workspace shown,
 * switches between personal and each family, opens the family's settings inside one, starts or
 * joins a family, and opens the tools.
 */
export function WorkspaceMenu({
  selected,
  onSelect,
  onOpenFamilies,
  onOpenFamilySettings,
  onOpenPet,
}: {
  selected: HomeMenuView;
  onSelect: (view: HomeMenuView) => void;
  onOpenFamilies: () => void;
  onOpenFamilySettings: () => void;
  onOpenPet: () => void;
}) {
  const theme = useZoptionTheme();
  const active = useActiveWorkspace();
  const netInfo = useNetInfo();
  const reachable = netInfo.isInternetReachable ?? netInfo.isConnected;
  const buttonRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const shownId = active.family?.id ?? null;
  const name = active.family?.name ?? "Personal";

  // A Modal sits above the scroll view, and Android only delivers touches inside a
  // parent's bounds, so the list is placed from the button's window position.
  const open = () => {
    setVisible(true);
    buttonRef.current?.measureInWindow((x, y, _width, height) => {
      setAnchor({ x, y: y + height + spacing.xs });
    });
  };
  const close = () => setVisible(false);

  // Choosing the workspace already shown is how the calculator returns to its dashboard.
  const chooseWorkspace = (familyId: string | null) => {
    close();
    onSelect("home");
    if (familyId !== shownId) active.switchTo(familyId);
  };

  const workspaces = [
    { id: null, label: "Personal", detail: "Only you", enabled: true },
    ...active.families.map((family) => {
      const enabled = familyOpenable(family.id, active.synced, reachable);
      return {
        id: family.id,
        label: family.name,
        detail: enabled ? ROLE_LABELS[family.role] : "Connect once to use offline",
        enabled,
      };
    }),
  ];

  return (
    <>
      <Pressable
        ref={buttonRef}
        accessibilityHint="Switches workspace or opens a tool"
        accessibilityLabel={`Workspace: ${name}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible }}
        collapsable={false}
        onPress={withTapSound(open)}
        style={[
          styles.button,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons
          color={String(theme.colors.brand)}
          name={active.family ? "account-group" : "account"}
          size={22}
        />
        <MaterialCommunityIcons
          color={String(theme.colors.textMuted)}
          name="chevron-down"
          size={16}
        />
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
            onPress={withTapSound(close)}
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
            <MenuHeading>Workspaces</MenuHeading>
            {workspaces.map((workspace) => (
              <MenuItem
                key={workspace.id ?? "personal"}
                detail={workspace.detail}
                disabled={!workspace.enabled}
                icon={workspace.id ? "account-group-outline" : "account-outline"}
                label={workspace.label}
                onPress={() => chooseWorkspace(workspace.id)}
                selected={selected === "home" && workspace.id === shownId}
              />
            ))}
            {active.family ? (
              <MenuItem
                icon="cog-outline"
                label="Family settings"
                detail="Members, invitations, and alerts"
                onPress={() => {
                  close();
                  onOpenFamilySettings();
                }}
              />
            ) : null}
            <MenuItem
              icon="plus"
              label={active.families.length > 0 ? "Start or join a family" : "Family workspace"}
              detail={active.families.length > 0 ? undefined : "Start one or join by invitation"}
              onPress={() => {
                close();
                onOpenFamilies();
              }}
            />
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <MenuHeading>Tools</MenuHeading>
            <MenuItem
              icon="cash-fast"
              label="Remittance calculator"
              onPress={() => {
                close();
                onSelect("remittance");
              }}
              selected={selected === "remittance"}
            />
            <MenuItem
              icon="paw"
              label="Pet"
              onPress={() => {
                close();
                onOpenPet();
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuHeading({ children }: { children: string }) {
  const theme = useZoptionTheme();
  return (
    <Text style={[typography.caption, styles.heading, { color: theme.colors.textMuted }]}>
      {children.toUpperCase()}
    </Text>
  );
}

function MenuItem({
  icon,
  label,
  detail,
  selected = false,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const color = selected ? theme.colors.brand : theme.colors.text;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="menuitem"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={withTapSound(onPress)}
      style={[styles.item, { opacity: disabled ? 0.5 : 1 }]}
    >
      <MaterialCommunityIcons color={String(color)} name={icon} size={20} />
      <View style={styles.itemText}>
        <Text
          numberOfLines={1}
          style={[typography.body, { color, fontWeight: selected ? "600" : "400" }]}
        >
          {label}
        </Text>
        {detail ? (
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{detail}</Text>
        ) : null}
      </View>
      {selected ? (
        <MaterialCommunityIcons color={String(theme.colors.brand)} name="check" size={18} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  list: {
    position: "absolute",
    minWidth: 260,
    maxWidth: 320,
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
  heading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxs,
    letterSpacing: 0.6,
  },
  item: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  itemText: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xxs },
});
