export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_KEY_PREFIX = "avatars/";

const avatarExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export function isAllowedAvatarType(value: string): value is keyof typeof avatarExtensions {
  return value in avatarExtensions;
}

export function parseAvatarPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const parts = path.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  if (!/^[a-zA-Z0-9-]+$/.test(parts[0])) return undefined;
  if (!/^[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(parts[1])) return undefined;
  return path;
}

export function isOwnedAvatarPath(path: string | undefined, userId: string): path is string {
  const parsed = parseAvatarPath(path);
  return Boolean(parsed && parsed.startsWith(`${userId}/`));
}

export function createAvatarPath(userId: string, mimeType: string): string {
  if (!isAllowedAvatarType(mimeType)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  return `${userId}/${crypto.randomUUID()}.${avatarExtensions[mimeType]}`;
}

export function avatarObjectKey(path: string): string {
  return `${AVATAR_KEY_PREFIX}${path}`;
}

export async function putAvatarObject(
  bucket: R2Bucket,
  path: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await bucket.put(avatarObjectKey(path), body, {
    httpMetadata: { contentType },
  });
}

export async function getAvatarObject(
  bucket: R2Bucket,
  path: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(avatarObjectKey(path));
}

export async function deleteAvatarObject(bucket: R2Bucket, path: string): Promise<void> {
  await bucket.delete(avatarObjectKey(path));
}

export async function purgeUserAvatars(bucket: R2Bucket, userId: string): Promise<void> {
  const prefix = `${AVATAR_KEY_PREFIX}${userId}/`;
  let cursor: string | undefined;
  for (;;) {
    const listed = await bucket.list({ prefix, cursor, limit: 100 });
    await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
    if (!listed.truncated) return;
    cursor = listed.cursor;
  }
}

export async function servePublicAvatar(
  env: { AVATARS?: R2Bucket; SUPABASE_URL?: string },
  path: string,
): Promise<Response> {
  const parsed = parseAvatarPath(path);
  if (!parsed) return new Response("Not found", { status: 404 });

  const object = env.AVATARS ? await getAvatarObject(env.AVATARS, parsed) : null;
  if (object) {
    const headers = new Headers();
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
    return new Response(object.body, { headers });
  }

  const supabaseOrigin = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!supabaseOrigin) return new Response("Not found", { status: 404 });
  const fallback = await fetch(`${supabaseOrigin}/storage/v1/object/public/avatars/${parsed}`);
  if (!fallback.ok) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Type", fallback.headers.get("Content-Type") || "application/octet-stream");
  return new Response(fallback.body, { headers });
}
