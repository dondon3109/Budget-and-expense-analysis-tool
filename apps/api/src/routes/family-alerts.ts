import { familyAlertSettingsSchema } from "@zoption/shared";
import { Hono } from "hono";

import { HttpError } from "../errors";
import type { FamilyAlerts } from "../family-alerts";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";
import { familyTenantId } from "./remittances";

/** `/api/app/family/alerts`: the thresholds everyone can read and only the owner sets. */
export function createFamilyAlertRoutes(alerts: FamilyAlerts) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const tenantId = familyTenantId(context.get("tenant"));
    return context.json(await alerts.settings(context.env, tenantId));
  });

  routes.put("/", async (context) => {
    const tenant = context.get("tenant");
    const tenantId = familyTenantId(tenant);
    if (tenant.membership?.role !== "owner") {
      throw new HttpError(403, "family_owner_required", "Only the family owner can do this.");
    }
    const input = parseInput(
      familyAlertSettingsSchema,
      await readJson(context),
      "Check the alert amounts.",
    );
    return context.json(await alerts.saveSettings(context.env, tenantId, input));
  });

  return routes;
}
