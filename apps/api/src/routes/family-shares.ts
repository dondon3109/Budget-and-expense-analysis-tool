import { familyBalanceShareSchema, familyTransactionShareSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { FamilyShareRepository } from "../db/family-shares";
import { HttpError } from "../errors";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";
import { familyTenantId } from "./remittances";

/**
 * `/api/app/family/shares`: copies into the family the workspace header names. The auth
 * middleware already refuses viewers and closing families on every write here.
 */
export function createActiveFamilyShareRoutes(shares: FamilyShareRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/transactions", async (context) => {
    const input = parseInput(
      familyTransactionShareSchema,
      await readJson(context),
      "Choose a family account and category.",
    );
    const created = await shares.shareTransaction(
      context.env,
      familyTenantId(context.get("tenant")),
      context.get("authUser").id,
      input,
    );
    return context.json(created, 201);
  });

  routes.get("/balances", async (context) =>
    context.json({
      balances: await shares.familyBalances(context.env, familyTenantId(context.get("tenant"))),
    }),
  );

  routes.post("/balances", async (context) => {
    const input = parseInput(
      familyBalanceShareSchema,
      await readJson(context),
      "Choose an account.",
    );
    await shares.shareBalance(
      context.env,
      familyTenantId(context.get("tenant")),
      context.get("authUser").id,
      input.accountId,
    );
    return context.body(null, 204);
  });

  // The owner tidies the family page; the sharer stops a share from their own workspace.
  routes.delete("/balances/:shareId", async (context) => {
    const tenant = context.get("tenant");
    const familyId = familyTenantId(tenant);
    if (tenant.membership?.role !== "owner") {
      throw new HttpError(403, "family_owner_required", "Only the family owner can do this.");
    }
    await shares.removeBalance(
      context.env,
      familyId,
      parsePathParameter(context.req.param("shareId")),
    );
    return context.body(null, 204);
  });

  return routes;
}

/** `/api/app/families/balance-shares`: the signed-in person's own live balance shares. */
export function createMyBalanceShareRoutes(shares: FamilyShareRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ shares: await shares.myBalanceShares(context.env, context.get("authUser").id) }),
  );

  routes.post("/:shareId/stop", async (context) => {
    await shares.stopBalanceShare(
      context.env,
      context.get("authUser").id,
      parsePathParameter(context.req.param("shareId")),
    );
    return context.body(null, 204);
  });

  return routes;
}
