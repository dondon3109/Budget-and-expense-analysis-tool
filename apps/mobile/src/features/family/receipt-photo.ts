import { FAMILY_RECEIPT_MAX_BYTES } from "@zoption/shared";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** The long side a photo over the upload cap is shrunk to. */
const LONG_SIDE = 2400;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ReceiptPhoto {
  mimeType: string;
  base64: string;
}

/**
 * Reads a picked or scanned photo the way the family receipt upload takes it: a JPEG, PNG, or
 * WebP of 5 MB or less. A larger photo is shrunk to 2400px on its long side as a JPEG.
 */
export async function prepareReceiptPhoto(picked: {
  uri: string;
  mimeType?: string | null;
  width: number;
  height: number;
}): Promise<ReceiptPhoto> {
  const mimeType = picked.mimeType ?? "image/jpeg";
  const file = new File(picked.uri);
  if (ACCEPTED.has(mimeType) && (file.size ?? Infinity) <= FAMILY_RECEIPT_MAX_BYTES) {
    return { mimeType, base64: await file.base64() };
  }
  const context = ImageManipulator.manipulate(picked.uri);
  if (Math.max(picked.width, picked.height) > LONG_SIDE) {
    context.resize(picked.width >= picked.height ? { width: LONG_SIDE } : { height: LONG_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  // Base64 carries 3 bytes in every 4 characters.
  if (!saved.base64 || (saved.base64.length * 3) / 4 > FAMILY_RECEIPT_MAX_BYTES) {
    throw new Error("This photo is too large to keep. Try a closer picture of the receipt.");
  }
  return { mimeType: "image/jpeg", base64: saved.base64 };
}
