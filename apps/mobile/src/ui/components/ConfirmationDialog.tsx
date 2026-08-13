import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { elevation, radii, spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { Button } from "./Button";

interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  const theme = useZoptionTheme();
  return (
    <Modal animationType="fade" transparent visible={props.visible} onRequestClose={props.onCancel}>
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onCancel} />
        <View
          accessibilityRole="alert"
          style={[styles.dialog, elevation.dialog, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
            {props.title}
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>{props.message}</Text>
          <View className="flex-row justify-end gap-2">
            <Button variant="quiet" onPress={props.onCancel}>
              Cancel
            </Button>
            <Button variant={props.destructive ? "danger" : "primary"} onPress={props.onConfirm}>
              {props.confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  dialog: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
