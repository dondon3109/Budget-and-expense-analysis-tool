import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

const JSON_METHODS = new Set(["POST", "PATCH", "PUT"]);
const DEFAULT_JSON_BODY_LIMIT = 64 * 1024;
const IMPORT_PREVIEW_BODY_LIMIT = 3 * 1024 * 1024;
const ASSISTANT_VOICE_BODY_LIMIT = 4 * 1024 * 1024 + 64 * 1024;
const AVATAR_BODY_LIMIT = 2 * 1024 * 1024 + 64 * 1024;
const RECEIPT_IMAGE_BODY_LIMIT = 8 * 1024 * 1024 + 64 * 1024;
const AI_ENTRY_PDF_BODY_LIMIT = 5 * 1024 * 1024 + 64 * 1024;
const BILLING_WEBHOOK_BODY_LIMIT = 128 * 1024;
const SUPPORT_CHAT_BODY_LIMIT = 24 * 1024;

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

export interface MultipartBodyRule {
  maxSize: number;
  typeMessage: string;
  sizeMessage: string;
}

/**
 * The upload rule for a `/api/app/*` request that must be multipart, or undefined when the
 * request takes a JSON body or none. Voice entry also accepts a JSON transcript.
 */
export function multipartBodyRuleFor(
  method: string,
  path: string,
  contentType: string | undefined,
): MultipartBodyRule | undefined {
  const isVoiceEntry = path === "/api/app/entry/voice";
  const requestContentType = contentType?.toLowerCase() ?? "";
  const isVoiceJson = isVoiceEntry && isJsonContentType(requestContentType);

  const multipartRoute =
    method !== "POST" || isVoiceJson
      ? undefined
      : {
          "/api/app/assistant/voice/transcriptions": {
            maxSize: ASSISTANT_VOICE_BODY_LIMIT,
            typeMessage: "Send voice recordings as multipart form data.",
            sizeMessage: "The voice recording is too large.",
          },
          "/api/app/receipts/extract": {
            maxSize: RECEIPT_IMAGE_BODY_LIMIT,
            typeMessage: "Send the receipt photo as multipart form data.",
            sizeMessage: "The receipt photo is too large.",
          },
          "/api/app/entry/voice": {
            maxSize: ASSISTANT_VOICE_BODY_LIMIT,
            typeMessage: "Send voice recordings as multipart form data or JSON transcript.",
            sizeMessage: "The voice recording is too large.",
          },
          "/api/app/entry/pdf-preview": {
            maxSize: AI_ENTRY_PDF_BODY_LIMIT,
            typeMessage: "Send the statement PDF as multipart form data.",
            sizeMessage: "The statement PDF is too large.",
          },
          "/api/app/profile/avatar": {
            maxSize: AVATAR_BODY_LIMIT,
            typeMessage: "Send the profile picture as multipart form data.",
            sizeMessage: "The profile picture is too large.",
          },
        }[path];
  return multipartRoute;
}

/** The JSON body cap for a `/api/app/*` request, or undefined when it carries no JSON body. */
export function jsonBodyLimitFor(method: string, path: string): number | undefined {
  const requiresJson =
    JSON_METHODS.has(method) ||
    (method === "DELETE" && (path === "/api/app/account" || path === "/api/app/profile/avatar"));
  if (!requiresJson) return undefined;

  const maxSize =
    method === "POST" && path === "/api/app/imports/preview"
      ? IMPORT_PREVIEW_BODY_LIMIT
      : DEFAULT_JSON_BODY_LIMIT;
  return maxSize;
}

/** Public support chat: JSON only, capped well below the app default, never cached. */
export const supportBodyLimits: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  context.header("Cache-Control", "no-store");
  if (context.req.method !== "POST") {
    await next();
    return;
  }
  if (!isJsonContentType(context.req.header("Content-Type"))) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Send the request body as application/json.",
    );
  }
  const limitBody = bodyLimit({
    maxSize: SUPPORT_CHAT_BODY_LIMIT,
    onError: (limitedContext) =>
      limitedContext.json(
        { error: "payload_too_large", message: "The request body is too large." },
        413,
      ),
  }) as MiddlewareHandler<AppEnvironment>;
  return limitBody(context, next);
};

/** Content type and size gate for every authenticated `/api/app/*` request body. */
export const appBodyLimits: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const multipartRoute = multipartBodyRuleFor(
    context.req.method,
    context.req.path,
    context.req.header("Content-Type"),
  );
  if (multipartRoute) {
    const contentType = context.req.header("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data;")) {
      throw new HttpError(415, "unsupported_media_type", multipartRoute.typeMessage);
    }
    const limitBody = bodyLimit({
      maxSize: multipartRoute.maxSize,
      onError: (limitedContext) =>
        limitedContext.json(
          { error: "payload_too_large", message: multipartRoute.sizeMessage },
          413,
        ),
    }) as MiddlewareHandler<AppEnvironment>;
    return limitBody(context, next);
  }
  const maxSize = jsonBodyLimitFor(context.req.method, context.req.path);
  if (maxSize === undefined) {
    await next();
    return;
  }
  if (!isJsonContentType(context.req.header("Content-Type"))) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Send the request body as application/json.",
    );
  }

  const limitBody = bodyLimit({
    maxSize,
    onError: (limitedContext) =>
      limitedContext.json(
        { error: "payload_too_large", message: "The request body is too large." },
        413,
      ),
  }) as MiddlewareHandler<AppEnvironment>;
  return limitBody(context, next);
};

export function createBillingWebhookBodyLimit(): MiddlewareHandler<AppEnvironment> {
  return bodyLimit({
    maxSize: BILLING_WEBHOOK_BODY_LIMIT,
    onError: (limitedContext) =>
      limitedContext.json(
        { error: "payload_too_large", message: "The request body is too large." },
        413,
      ),
  }) as MiddlewareHandler<AppEnvironment>;
}
