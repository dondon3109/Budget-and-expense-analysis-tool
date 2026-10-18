import { FAMILY_RECEIPT_MAX_BYTES } from "@zoption/shared";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const LONG_SIDE = 2400;

/**
 * A photo ready for a family receipt upload: kept as it is when it already fits, otherwise
 * redrawn as a JPEG no longer than 2400px, which keeps a receipt readable well under 5 MB.
 */
export async function prepareReceiptPhoto(file: File): Promise<Blob> {
  if (!ACCEPTED.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size <= FAMILY_RECEIPT_MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const shrunk = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!shrunk || shrunk.size > FAMILY_RECEIPT_MAX_BYTES) {
    throw new Error("This photo is too large. Choose one under 5 MB.");
  }
  return shrunk;
}
