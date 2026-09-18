import { Hono } from "hono";

import {
  AVATAR_MAX_BYTES,
  createAvatarPath,
  deleteAvatarObject,
  hasAvatarImageSignature,
  isAllowedAvatarType,
  isOwnedAvatarPath,
  parseAvatarPath,
  putAvatarObject,
} from "../avatars";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

function requireAvatarBucket(env: AppEnvironment["Bindings"]): R2Bucket {
  if (!env.AVATARS) {
    throw new HttpError(503, "avatars_unavailable", "Profile picture storage is not configured.");
  }
  return env.AVATARS;
}

export function createAvatarRoutes() {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const bucket = requireAvatarBucket(context.env);
    const body = await context.req.parseBody({ all: false });
    const file = body.file;
    if (!(file instanceof File)) {
      throw new HttpError(400, "invalid_request", "Choose a JPEG, PNG, or WebP image.");
    }
    if (!file.size) throw new HttpError(400, "invalid_request", "Choose a non-empty image file.");
    if (file.size > AVATAR_MAX_BYTES) {
      throw new HttpError(400, "invalid_request", "Profile pictures must be 2 MB or smaller.");
    }
    if (!isAllowedAvatarType(file.type)) {
      throw new HttpError(400, "invalid_request", "Choose a JPEG, PNG, or WebP image.");
    }

    const bytes = await file.arrayBuffer();
    if (!hasAvatarImageSignature(file.type, new Uint8Array(bytes))) {
      throw new HttpError(400, "invalid_request", "Choose a JPEG, PNG, or WebP image.");
    }

    const path = createAvatarPath(context.get("authUser").id, file.type);
    await putAvatarObject(bucket, path, bytes, file.type);
    return context.json({ path }, 201);
  });

  routes.delete("/", async (context) => {
    const bucket = requireAvatarBucket(context.env);
    const parsed = (await readJson(context).catch(() => ({}))) as { path?: unknown };
    const path = typeof parsed.path === "string" ? parseAvatarPath(parsed.path) : undefined;
    if (!isOwnedAvatarPath(path, context.get("authUser").id)) {
      throw new HttpError(400, "invalid_request", "That profile picture could not be removed.");
    }
    await deleteAvatarObject(bucket, path);
    return context.body(null, 204);
  });

  return routes;
}
