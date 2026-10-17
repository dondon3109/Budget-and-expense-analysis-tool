import { shareLinkCreateSchema, type ShareLinkCreated } from "@zoption/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { ShareLinkRepository } from "../db/share-links";
import { HttpError } from "../errors";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment, Bindings } from "../types";

// Tokens are 16 random bytes in unpadded base64url; anything else cannot be a link.
const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/u);

const DEFAULT_SITE_URL = "https://zoption.site";

/**
 * The token rides in the fragment, which browsers never send to a server, so it stays out of
 * Pages logs, analytics, and Referer headers, and link-preview crawlers only ever see `/s`.
 */
function shareUrl(env: Bindings | undefined, token: string): string {
  const origin = env?.PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
  return `${origin.replace(/\/$/u, "")}/s#${token}`;
}

/** `GET /api/public/shares/:token`: the snapshot behind a link, for anyone holding it. */
export function createPublicShareLinkRoutes(shareLinks: ShareLinkRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/:token", async (context) => {
    // A revoke must take effect at once, and the response is someone's money.
    context.header("Cache-Control", "no-store");
    context.header("X-Robots-Tag", "noindex, nofollow");
    const token = shareTokenSchema.safeParse(context.req.param("token"));
    const share = token.success ? await shareLinks.readPublic(context.env, token.data) : null;
    // Unknown, revoked, and expired links all look the same to the caller.
    if (!share) throw new HttpError(404, "share_link_not_found", "This link is unavailable.");
    return context.json(share);
  });

  return routes;
}

/** The signed-in owner's create, list, and revoke under `/api/app/shares`. */
export function createShareLinkRoutes(shareLinks: ShareLinkRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const input = parseInput(
      shareLinkCreateSchema,
      await readJson(context),
      "Choose what to share and how long the link lasts.",
    );
    const created = await shareLinks.create(
      context.env,
      context.get("tenant").tenantId,
      context.get("authUser").id,
      input,
    );
    const body: ShareLinkCreated = {
      id: created.id,
      url: shareUrl(context.env, created.token),
      snapshot: created.snapshot,
      sharerName: created.sharerName,
      expiresAt: created.expiresAt,
    };
    return context.json(body, 201);
  });

  routes.get("/", async (context) =>
    context.json({ items: await shareLinks.list(context.env, context.get("tenant").tenantId) }),
  );

  routes.delete("/:id", async (context) => {
    const id = parsePathParameter(context.req.param("id"), z.string().uuid());
    await shareLinks.revoke(context.env, context.get("tenant").tenantId, id);
    return context.body(null, 204);
  });

  return routes;
}
