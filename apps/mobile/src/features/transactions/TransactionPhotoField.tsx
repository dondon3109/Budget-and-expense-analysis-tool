import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import type { ComponentProps } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { prepareReceiptPhoto, type ReceiptPhoto } from "@/features/family/receipt-photo";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

/**
 * The editor's photo of an entry. A personal entry keeps a small picture on this device only; a
 * family entry's receipt photo is shared with the family, so it keeps more detail (shrunk only
 * past the upload cap).
 */
export function TransactionPhotoField({
  family,
  photoUri,
  disabled,
  onPick,
  onRemove,
  onError,
}: {
  family: boolean;
  photoUri: string | null;
  disabled: boolean;
  onPick: (photo: ReceiptPhoto) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const theme = useZoptionTheme();
  const pick = async (source: "camera" | "library"): Promise<void> => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: family ? 0.75 : 0.4,
      base64: !family,
    };
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        onError("Allow camera access in Settings to take a picture.");
        return;
      }
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (!family) {
      if (asset.base64) onPick({ mimeType: asset.mimeType ?? "image/jpeg", base64: asset.base64 });
      return;
    }
    try {
      onPick(await prepareReceiptPhoto(asset));
    } catch (error) {
      onError(error instanceof Error ? error.message : "This photo could not be used.");
    }
  };

  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: theme.colors.text }]}>
        {family ? "Receipt photo (shared with the family)" : "Photo"}
      </Text>
      {photoUri ? (
        <View>
          <Image
            accessibilityLabel={family ? "Receipt photo" : "Transaction photo"}
            resizeMode="cover"
            source={{ uri: photoUri }}
            style={[styles.photo, { backgroundColor: theme.colors.canvasMuted }]}
          />
          <Pressable
            accessibilityLabel="Remove photo"
            accessibilityRole="button"
            disabled={disabled}
            hitSlop={spacing.xs}
            onPress={withTapSound(onRemove)}
            style={[styles.remove, { backgroundColor: theme.colors.overlay }]}
          >
            {/* The overlay color is dark in every theme. */}
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color="#ffffff"
              name="close"
              size={18}
            />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <PhotoSourceTile
          disabled={disabled}
          icon="camera-outline"
          label={photoUri ? "Retake" : "Take photo"}
          onPress={() => void pick("camera")}
        />
        <PhotoSourceTile
          disabled={disabled}
          icon="image-outline"
          label={photoUri ? "Replace" : "Choose photo"}
          onPress={() => void pick("library")}
        />
      </View>
    </View>
  );
}

/** One way to add the photo, styled like the editor's account tiles. */
function PhotoSourceTile({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={withTapSound(onPress)}
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.canvasMuted }]}>
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.textMuted}
          name={icon}
          size={18}
        />
      </View>
      <Text numberOfLines={1} style={[typography.label, { color: theme.colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.xs },
  tile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: "100%", height: 200, borderRadius: radii.md },
  remove: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
