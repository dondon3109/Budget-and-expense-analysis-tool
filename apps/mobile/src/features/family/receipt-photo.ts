import { FAMILY_RECEIPT_MAX_BYTES } from "@zoption/shared";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** The long side a photo over the upload cap is shrunk to. */
const LONG_SIDE = 2400;
/** The receipt extract route's upload limit. */
const SCAN_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_BY_EXTENSION: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** User-facing photo validation error safe to show directly in the receipt scanner UI. */
export class ReceiptPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptPhotoError";
  }
}

export interface ReceiptPhoto {
  mimeType: string;
  base64: string;
}

export interface PreparedScanPhoto {
  uri: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** True when this helper created a temporary JPEG copy that the caller should discard. */
  temporary: boolean;
}

function normalizedImageMime(
  mimeType?: string | null,
  fileName?: string | null,
  uri?: string,
): "image/jpeg" | "image/png" | "image/webp" | null {
  const declared = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  if (declared === "image/jpeg" || declared === "image/png" || declared === "image/webp") {
    return declared;
  }
  if (declared && declared.startsWith("image/")) {
    return null;
  }
  const source = fileName || uri || "";
  const extension = source.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

/**
 * Ensures a picked or captured receipt photo is JPEG, PNG, or WebP and fits the 8 MB scan limit.
 * Unsupported formats (such as HEIC) or oversized photos are converted to a temporary JPEG.
 */
export async function prepareScanPhoto(picked: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
}): Promise<PreparedScanPhoto> {
  const acceptedMime = normalizedImageMime(picked.mimeType, picked.fileName, picked.uri);
  let size: number | null = null;
  try {
    const file = new File(picked.uri);
    if (typeof file.size === "number" && file.size > 0) size = file.size;
  } catch {
    // Keep going: the native file lookup may be unavailable in tests or virtual URIs.
  }
  if (acceptedMime && (size === null || size <= SCAN_MAX_BYTES)) {
    const fallbackExt =
      acceptedMime === "image/png" ? "png" : acceptedMime === "image/webp" ? "webp" : "jpg";
    return {
      uri: picked.uri,
      fileName: picked.fileName || `receipt.${fallbackExt}`,
      mimeType: acceptedMime,
      temporary: false,
    };
  }
  const context = ImageManipulator.manipulate(picked.uri);
  const width = picked.width ?? 0;
  const height = picked.height ?? 0;
  if (Math.max(width, height) > LONG_SIDE) {
    context.resize(width >= height ? { width: LONG_SIDE } : { height: LONG_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const savedFile = new File(saved.uri);
  if (typeof savedFile.size === "number" && savedFile.size > SCAN_MAX_BYTES) {
    try {
      savedFile.delete();
    } catch {
      // Best-effort cleanup of an oversized temporary image.
    }
    throw new ReceiptPhotoError(
      "This photo is too large to scan. Try a closer picture of the receipt.",
    );
  }
  return {
    uri: saved.uri,
    fileName: "receipt.jpg",
    mimeType: "image/jpeg",
    temporary: true,
  };
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
    throw new ReceiptPhotoError(
      "This photo is too large to keep. Try a closer picture of the receipt.",
    );
  }
  return { mimeType: "image/jpeg", base64: saved.base64 };
}
