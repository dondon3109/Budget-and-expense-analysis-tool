import {
  familyRemittanceOverviewQuerySchema,
  familyRemittanceReceiveSchema,
  familyRemittanceSendSchema,
  type FamilyRemittance,
} from "@zoption/shared";
import { Hono, type Context } from "hono";

import type { RemittanceRepository } from "../db/remittances";
import { HttpError } from "../errors";
import { arrivalNotice, type FamilyNotifier } from "../family-notifier";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment, TenantContext } from "../types";

/** The family the workspace header names; family surfaces refuse a personal workspace. */
export function familyTenantId(tenant: TenantContext): string {
  if (!tenant.membership) {
    throw new HttpError(400, "family_required", "Open a family workspace first.");
  }
  return tenant.tenantId;
}

/** Runs after the response where the Worker allows it; tests have no execution context. */
export async function afterResponse(context: Context<AppEnvironment>, work: Promise<void>) {
  try {
    context.executionCtx.waitUntil(work);
  } catch {
    await work;
  }
}

/** `/api/app/family/remittances`: money sent home to the family the header names. */
export function createRemittanceRoutes(
  remittances: RemittanceRepository,
  notifier: FamilyNotifier,
) {
  const routes = new Hono<AppEnvironment>();

  async function announceArrival(context: Context<AppEnvironment>, remittance: FamilyRemittance) {
    const notice = arrivalNotice(context.get("tenant").tenantId, remittance);
    if (notice) await afterResponse(context, notifier.notify(context.env, notice));
  }

  routes.get("/", async (context) => {
    const query = parseInput(
      familyRemittanceOverviewQuerySchema,
      context.req.query(),
      "Choose a month.",
    );
    return context.json(
      await remittances.overview(context.env, familyTenantId(context.get("tenant")), query.month),
    );
  });

  routes.post("/", async (context) => {
    const input = parseInput(
      familyRemittanceSendSchema,
      await readJson(context),
      "Check the remittance details.",
    );
    const remittance = await remittances.send(
      context.env,
      familyTenantId(context.get("tenant")),
      context.get("authUser").id,
      input,
    );
    await announceArrival(context, remittance);
    return context.json(remittance, 201);
  });

  routes.post("/:remittanceId/receive", async (context) => {
    const input = parseInput(
      familyRemittanceReceiveSchema,
      await readJson(context),
      "Enter what arrived and where.",
    );
    const remittance = await remittances.receive(
      context.env,
      familyTenantId(context.get("tenant")),
      context.get("authUser").id,
      parsePathParameter(context.req.param("remittanceId")),
      input,
    );
    await announceArrival(context, remittance);
    return context.json(remittance);
  });

  // The sender cancels their own send; the owner can cancel any that never arrived.
  routes.delete("/:remittanceId", async (context) => {
    const tenant = context.get("tenant");
    await remittances.cancel(
      context.env,
      familyTenantId(tenant),
      parsePathParameter(context.req.param("remittanceId")),
      tenant.membership?.role === "owner" ? undefined : context.get("authUser").id,
    );
    return context.body(null, 204);
  });

  return routes;
}
