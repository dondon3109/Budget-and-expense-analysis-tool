import { supabase } from "./supabase";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

const MAX_AVATAR_SIDE = 4096;
const MAX_AVATAR_PIXELS = 16_000_000;
const avatarExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export interface AvatarOperationResult {
  cleanupWarning?: string;
}

export function avatarPathFromMetadata(metadata?: Record<string, unknown>): string | undefined {
  const path = metadata?.avatar_path;
  if (typeof path !== "string") return undefined;

  const parts = path.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  if (!/^[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(parts[1])) return undefined;
  return path;
}

export function isOwnedAvatarPath(path: string | undefined, userId: string): path is string {
  return Boolean(
    path && avatarPathFromMetadata({ avatar_path: path }) === path && path.startsWith(`${userId}/`),
  );
}

export function createAvatarPath(userId: string, mimeType: string): string {
  const extension = avatarExtensions[mimeType as keyof typeof avatarExtensions];
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

export function avatarPublicUrl(path: string | undefined): string | undefined {
  if (!path || !supabase) return undefined;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function avatarInitials(displayName: string | undefined, email: string | undefined): string {
  const words = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) {
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
    return `${first}${last}`.toUpperCase();
  }

  const emailName = email?.split("@")[0]?.trim();
  return emailName?.[0]?.toUpperCase() || "Z";
}

export async function validateAvatarFile(file: File): Promise<void> {
  if (!file.size) throw new Error("Choose a non-empty image file.");
  if (file.size > AVATAR_MAX_BYTES) throw new Error("Profile pictures must be 2 MB or smaller.");
  if (!(file.type in avatarExtensions)) throw new Error("Choose a JPEG, PNG, or WebP image.");

  if (typeof createImageBitmap !== "function") return;

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be read. Choose another file.");
  }

  const tooLarge =
    image.width > MAX_AVATAR_SIDE ||
    image.height > MAX_AVATAR_SIDE ||
    image.width * image.height > MAX_AVATAR_PIXELS;
  image.close();

  if (tooLarge) throw new Error("Choose an image no larger than 4096 × 4096 pixels.");
}
