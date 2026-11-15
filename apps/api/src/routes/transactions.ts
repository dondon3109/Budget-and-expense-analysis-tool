import {
  transactionCalendarQuerySchema,
  transactionInputSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { FamilyJournal } from "../db/family-journal";
import type { EntryAccess, TransactionRepository } from "../db/transactions";
import { HttpError } from "../errors";
import type { FamilyAlerts } from "../family-alerts";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { SubscriptionRenewalService } from "../subscriptions/renewals";
import type { AppEnvironment, Bindings, TenantContext } from "../types";
import { afterResponse } from "./remittances";

/** In a family, members change only the entries they added; the owner changes any. */
export function entryAccess(tenant: TenantContext, userId: string): EntryAccess | undefined {
  return tenant.membership && tenant.membership.role !== "owner"
    ? { authorOnly: userId }
    : undefined;
}

const notFound = () => new HttpError(404, "transaction_not_found", "Transaction not found.");

/**
 * `family.journal` records family changes and deletes, and `family.alerts` reacts to a new
 * family expense; personal rows have neither. `renewals` charges a personal subscription held
 * back for balance as soon as a write covers it; subscriptions are personal only.
 */
export function createTransactionRoutes(
  repository: TransactionRepository,
  family: { journal: FamilyJournal; alerts: FamilyAlerts },
  renewals?: Pick<SubscriptionRenewalService, "settleTenantRenewals">,
) {
  const { journal, alerts } = family;
  const routes = new Hono<AppEnvironment>();
  // Awaited before the response, so the client's refetch already sees the charge.
  const settleRenewals = async (env: Bindings, tenant: TenantContext) => {
    if (renewals && !tenant.membership) await renewals.settleTenantRenewals(env, tenant.tenantId);
  };

  routes.get("/calendar", async (context) => {
    const input = parseInput(
      transactionCalendarQuerySchema,
      context.req.query(),
      "Choose a valid calendar month.",
    );
    return context.json(
      await repository.calendar(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.get("/", async (context) => {
    const input = parseInput(
      transactionListQuerySchema,
      context.req.query(),
      "Check the transaction filters.",
    );
    return context.json(await repository.list(context.env, context.get("tenant").tenantId, input));
  });

  routes.post("/", async (context) => {
    const body = await readJson(context);
    const input = parseInput(transactionInputSchema, body, "Check the transaction fields.");
    const tenant = context.get("tenant");
    // Family rows record who added them; personal rows have only one person.
    const authorUserId = tenant.membership ? context.get("authUser").id : undefined;
    const created = await repository.create(context.env, tenant.tenantId, input, {
      authorUserId,
    });
    if (authorUserId) {
      await afterResponse(
        context,
        alerts.afterExpense(context.env, tenant.tenantId, authorUserId, created),
      );
    }
    await settleRenewals(context.env, tenant);
    return context.json(created, 201);
  });

  routes.patch("/:id", async (context) => {
    const body = await readJson(context);
    const input = parseInput(transactionUpdateSchema, body, "Check the transaction fields.");
    const tenant = context.get("tenant");
    const userId = context.get("authUser").id;
    const id = parsePathParameter(context.req.param("id"));
    const before = tenant.membership
      ? await journal.capture(context.env, tenant.tenantId, id)
      : null;
    const updated = await repository.update(
      context.env,
      tenant.tenantId,
      id,
      input,
      entryAccess(tenant, userId),
    );
    if (before) await journal.recordUpdate(context.env, tenant.tenantId, userId, before, updated);
    await settleRenewals(context.env, tenant);
    return context.json(updated);
  });

  routes.delete("/:id", async (context) => {
    const tenant = context.get("tenant");
    const userId = context.get("authUser").id;
    const id = parsePathParameter(context.req.param("id"));
    const access = entryAccess(tenant, userId);
    if (!tenant.membership) {
      await repository.remove(context.env, tenant.tenantId, id, access);
      await settleRenewals(context.env, tenant);
      return context.body(null, 204);
    }
    // A family delete is journaled first, with the rows a restore needs.
    const before = await journal.capture(context.env, tenant.tenantId, id);
    if (!before) throw notFound();
    const withdraw = await journal.recordDelete(context.env, tenant.tenantId, userId, before);
    try {
      await repository.remove(context.env, tenant.tenantId, id, access);
    } catch (error) {
      await withdraw();
      throw error;
    }
    return context.body(null, 204);
  });

  return routes;
}
