import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

const KIB = 1024;
const MIB = 1024 * KIB;
// Uploads get 64 KiB of headroom over the file cap for the multipart envelope.
const MULTIPART_ENVELOPE = 64 * KIB;
const JSON_METHODS = new Set(["POST", "PATCH", "PUT"]);
const DEFAULT_JSON_BODY_LIMIT = 64 * KIB;
const IMPORT_PREVIEW_BODY_LIMIT = 3 * MIB;
const ASSISTANT_VOICE_BODY_LIMIT = 4 * MIB + MULTIPART_ENVELOPE;
const BILLING_WEBHOOK_BODY_LIMIT = 128 * KIB;
const SUPPORT_CHAT_BODY_LIMIT = 24 * KIB;
const JSON_REQUIRED = "Send the request body as application/json.";
const BODY_TOO_LARGE = "The request body is too large.";

export interface MultipartBodyRule {
  maxSize: number;
  typeMessage: string;
  sizeMessage: string;
}

/** POST routes that take a multipart upload, keyed by exact path. */
const MULTIPART_UPLOADS = new Map<string, MultipartBodyRule>([
  [
    "/api/app/assistant/voice/transcriptions",
    {
      maxSize: ASSISTANT_VOICE_BODY_LIMIT,
      typeMessage: "Send voice recordings as multipart form data.",
      sizeMessage: "The voice recording is too large.",
    },
  ],
  [
    "/api/app/receipts/extract",
    {
      maxSize: 8 * MIB + MULTIPART_ENVELOPE,
      typeMessage: "Send the receipt photo as multipart form data.",
      sizeMessage: "The receipt photo is too large.",
    },
  ],
  [
    "/api/app/entry/voice",
    {
      maxSize: ASSISTANT_VOICE_BODY_LIMIT,
      typeMessage: "Send voice recordings as multipart form data or JSON transcript.",
      sizeMessage: "The voice recording is too large.",
    },
  ],
  [
    "/api/app/entry/pdf-preview",
    {
      maxSize: 5 * MIB + MULTIPART_ENVELOPE,
      typeMessage: "Send the statement PDF as multipart form data.",
      sizeMessage: "The statement PDF is too large.",
    },
  ],
  [
    "/api/app/profile/avatar",
    {
      maxSize: 2 * MIB + MULTIPART_ENVELOPE,
      typeMessage: "Send the profile picture as multipart form data.",
      sizeMessage: "The profile picture is too large.",
    },
  ],
]);

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function capBody(maxSize: number, message: string): MiddlewareHandler<AppEnvironment> {
  return bodyLimit({
    maxSize,
    onError: (limitedContext) => limitedContext.json({ error: "payload_too_large", message }, 413),
  }) as MiddlewareHandler<AppEnvironment>;
}

/**
 * The upload rule for a `/api/app/*` request that must be multipart, or undefined when the
 * request takes a JSON body or none.
 */
export function multipartBodyRuleFor(
  method: string,
  path: string,
  contentType: string | undefined,
): MultipartBodyRule | undefined {
  if (method !== "POST") return undefined;
  // Voice entry also accepts a JSON transcript, which falls through to the JSON cap.
  if (path === "/api/app/entry/voice" && isJsonContentType(contentType)) return undefined;
  return MULTIPART_UPLOADS.get(path);
}

/** The JSON body cap for a `/api/app/*` request, or undefined when it carries no JSON body. */
export function jsonBodyLimitFor(method: string, path: string): number | undefined {
  const isDeleteWithBody =
    method === "DELETE" && (path === "/api/app/account" || path === "/api/app/profile/avatar");
  if (!JSON_METHODS.has(method) && !isDeleteWithBody) return undefined;
  // The browser mints the voice ticket with a bodyless POST, which has no Content-Type to check.
  if (method === "POST" && path === "/api/app/assistant/voice/ticket") return undefined;
  if (method === "POST" && path === "/api/app/imports/preview") return IMPORT_PREVIEW_BODY_LIMIT;
  return DEFAULT_JSON_BODY_LIMIT;
}

/** Public support chat: JSON only, capped well below the app default, never cached. */
export const supportBodyLimits: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  context.header("Cache-Control", "no-store");
  if (context.req.method !== "POST") {
    await next();
    return;
  }
  if (!isJsonContentType(context.req.header("Content-Type"))) {
    throw new HttpError(415, "unsupported_media_type", JSON_REQUIRED);
  }
  return capBody(SUPPORT_CHAT_BODY_LIMIT, BODY_TOO_LARGE)(context, next);
};

/** Content type and size gate for every authenticated `/api/app/*` request body. */
export const appBodyLimits: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const { method, path } = context.req;
  const contentType = context.req.header("Content-Type");

  const upload = multipartBodyRuleFor(method, path, contentType);
  if (upload) {
    if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
      throw new HttpError(415, "unsupported_media_type", upload.typeMessage);
    }
    return capBody(upload.maxSize, upload.sizeMessage)(context, next);
  }

  const maxSize = jsonBodyLimitFor(method, path);
  if (maxSize === undefined) {
    await next();
    return;
  }
  if (!isJsonContentType(contentType)) {
    throw new HttpError(415, "unsupported_media_type", JSON_REQUIRED);
  }
  return capBody(maxSize, BODY_TOO_LARGE)(context, next);
};

export function createBillingWebhookBodyLimit(): MiddlewareHandler<AppEnvironment> {
  return capBody(BILLING_WEBHOOK_BODY_LIMIT, BODY_TOO_LARGE);
}
