import * as ImagePicker from "expo-image-picker";
import { Image, StyleSheet, Text, View } from "react-native";

import { prepareReceiptPhoto, type ReceiptPhoto } from "@/features/family/receipt-photo";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

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
    <View className="w-full gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>
        {family ? "Receipt photo (shared with the family)" : "Photo (stays on this device)"}
      </Text>
      {photoUri ? (
        <Image
          accessibilityLabel={family ? "Receipt photo" : "Transaction photo"}
          resizeMode="contain"
          source={{ uri: photoUri }}
          style={styles.photo}
        />
      ) : null}
      <View className="flex-row gap-3">
        <Button disabled={disabled} onPress={() => void pick("camera")} variant="secondary">
          Take photo
        </Button>
        <Button disabled={disabled} onPress={() => void pick("library")} variant="secondary">
          Choose photo
        </Button>
        {photoUri ? (
          <Button disabled={disabled} onPress={onRemove} variant="quiet">
            Remove
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: 220, borderRadius: 12 },
});
