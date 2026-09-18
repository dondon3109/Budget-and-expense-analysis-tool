export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_KEY_PREFIX = "avatars/";

const avatarExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export function isAllowedAvatarType(value: string): value is keyof typeof avatarExtensions {
  return Object.hasOwn(avatarExtensions, value);
}

// The declared content type is client supplied, so a caller can label any bytes as an
// image. Check the file signature before storing an upload under an image extension.
export function hasAvatarImageSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
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

// Pictures are deleted without a versioned URL, so caches must not hold them for a
// year: serve them briefly and revalidate instead of marking them immutable.
function avatarResponse(body: ReadableStream | null, contentType: string | null): Response {
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=60, must-revalidate");
  headers.set("Content-Type", contentType || "application/octet-stream");
  return new Response(body, { headers });
}

export async function servePublicAvatar(
  env: { AVATARS?: R2Bucket; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string },
  path: string,
): Promise<Response> {
  const parsed = parseAvatarPath(path);
  if (!parsed) return new Response("Not found", { status: 404 });

  const object = env.AVATARS ? await getAvatarObject(env.AVATARS, parsed) : null;
  if (object) return avatarResponse(object.body, object.httpMetadata?.contentType ?? null);

  const supabaseOrigin = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseOrigin || !serviceRoleKey) return new Response("Not found", { status: 404 });
  // The bucket is private, so pictures that predate the R2 cutover are read with the
  // service role instead of the world-readable object URL.
  const fallback = await fetch(
    `${supabaseOrigin}/storage/v1/object/authenticated/avatars/${parsed}`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!fallback.ok) return new Response("Not found", { status: 404 });
  return avatarResponse(fallback.body, fallback.headers.get("Content-Type"));
}
