import { Hono } from "hono";

import type { FamilyJournal } from "../db/family-journal";
import { parsePathParameter } from "../request";
import type { AppEnvironment } from "../types";
import { familyTenantId } from "./remittances";

/**
 * `/api/app/family/transactions`: the history of the family's entries and the recently
 * deleted ones. Everyone in the family reads them; the owner restores any deleted entry, and
 * anyone else only their own deletes, which is how a member's Undo works.
 */
export function createFamilyEntryRoutes(journal: FamilyJournal) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/deleted", async (context) => {
    const tenantId = familyTenantId(context.get("tenant"));
    return context.json({ entries: await journal.deleted(context.env, tenantId) });
  });

  routes.get("/:id/history", async (context) => {
    const tenantId = familyTenantId(context.get("tenant"));
    const id = parsePathParameter(context.req.param("id"));
    return context.json({ events: await journal.history(context.env, tenantId, id) });
  });

  routes.post("/:id/restore", async (context) => {
    const tenant = context.get("tenant");
    const tenantId = familyTenantId(tenant);
    const userId = context.get("authUser").id;
    const id = parsePathParameter(context.req.param("id"));
    const deleterOnly = tenant.membership?.role === "owner" ? undefined : userId;
    await journal.restore(context.env, tenantId, userId, id, deleterOnly);
    return context.body(null, 204);
  });

  return routes;
}
