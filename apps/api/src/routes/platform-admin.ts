import { sponsoredSeatEmailRequestSchema, sponsoredSeatSlotSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { PlatformAdminService } from "../platform-admin";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

function seatSlot(value: string | undefined): number {
  const parsed = sponsoredSeatSlotSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new HttpError(400, "invalid_sponsored_seat", "Choose a valid sponsored seat.");
}

async function recipientEmail(context: Parameters<typeof readJson>[0]): Promise<string> {
  const parsed = sponsoredSeatEmailRequestSchema.safeParse(await readJson(context));
  if (parsed.success) return parsed.data.email;
  throw new HttpError(400, "invalid_request", "Enter a valid email address.");
}

export function createPlatformAdminRoutes(service: PlatformAdminService) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/sponsored-seats", async (context) =>
    context.json(await service.listSeats(context.env, context.get("authUser").id)),
  );

  routes.post("/sponsored-seats", async (context) =>
    context.json(
      await service.addRecipient(
        context.env,
        context.get("authUser").id,
        await recipientEmail(context),
      ),
      201,
    ),
  );

  routes.post("/sponsored-seats/invitations", async (context) =>
    context.json(
      await service.createInvitation(
        context.env,
        context.get("authUser").id,
        await recipientEmail(context),
      ),
      201,
    ),
  );

  routes.put("/sponsored-seats/:slotNumber", async (context) =>
    context.json(
      await service.replaceSeat(
        context.env,
        context.get("authUser").id,
        seatSlot(context.req.param("slotNumber")),
        await recipientEmail(context),
      ),
    ),
  );

  routes.delete("/sponsored-seats/:slotNumber", async (context) => {
    await service.revokeSeat(
      context.env,
      context.get("authUser").id,
      seatSlot(context.req.param("slotNumber")),
    );
    return context.body(null, 204);
  });

  routes.post("/sponsored-seats/:slotNumber/invitation", async (context) => {
    await service.resendInvitation(
      context.env,
      context.get("authUser").id,
      seatSlot(context.req.param("slotNumber")),
    );
    return context.body(null, 204);
  });

  return routes;
}

export function createIdentityRoutes(service: PlatformAdminService) {
  const routes = new Hono<AppEnvironment>();
  routes.post("/", async (context) => {
    await service.syncIdentity(context.env, context.get("authUser"), context.get("accessToken"));
    return context.body(null, 204);
  });
  return routes;
}
