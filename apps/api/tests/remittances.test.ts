import type { DatabaseSync } from "node:sqlite";

import {
  WORKSPACE_HEADER,
  familyRemittanceOverviewSchema,
  familyRemittanceSchema,
} from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { remittanceRepository } from "../src/db/remittances";
import {
  createTenantResolver,
  defaultAccountIdForTenant,
  defaultCategoryIdForTenant,
  starterStatements,
  tenantBootstrapRepository,
} from "../src/db/tenants";
import { HttpError } from "../src/errors";
import type { FamilyNotifier } from "../src/family-notifier";
import { createRemittanceRoutes } from "../src/routes/remittances";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family:dela-cruz";
const MONTH = "2026-10-01";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** Kuya works abroad and sends money; Mama owns the family; Lola only views. */
async function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = { DB: binding } as unknown as Bindings;
  for (const id of ["mama", "kuya", "lola"]) await tenantBootstrapRepository.bootstrap(env, { id });
  database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'family', 'Dela Cruz family')")
    .run(FAMILY);
  await env.DB.batch(starterStatements(env, FAMILY));
  const member = database.prepare(
    "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)",
  );
  member.run(FAMILY, "mama", "owner");
  member.run(FAMILY, "kuya", "member");
  member.run(FAMILY, "lola", "viewer");

  const notify = vi.fn<FamilyNotifier["notify"]>(async () => undefined);
  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.route(
    "/api/app/family/remittances",
    createRemittanceRoutes(remittanceRepository, { notify }),
  );
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = (user: string, method: string, path: string, body?: unknown) =>
    app.request(
      `/api/app/family/remittances${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
          [WORKSPACE_HEADER]: FAMILY,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      env,
    );
  const arrival = (amountMinor: number, date = "2026-10-03") => ({
    amountMinor,
    accountId: defaultAccountIdForTenant(FAMILY),
    categoryId: defaultCategoryIdForTenant(FAMILY, "salary"),
    date,
  });
  const send = async (user: string, body: Record<string, unknown>) =>
    familyRemittanceSchema.parse(
      await (
        await call(user, "POST", "", {
          sentAmountMinor: 50_000,
          sentCurrency: "USD",
          provider: "Wise",
          sentOn: "2026-10-02",
          ...body,
        })
      ).json(),
    );
  const overview = async () =>
    familyRemittanceOverviewSchema.parse(
      await (await call("lola", "GET", `?month=${MONTH}`)).json(),
    );
  /** A family expense, to fill "Spent". */
  const spend = (amountMinor: number, date: string) =>
    database
      .prepare(
        `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description,
           amount_minor, currency, kind)
         VALUES (?, ?, ?, ?, ?, 'Rice', ?, 'PHP', 'expense')`,
      )
      .run(
        crypto.randomUUID(),
        FAMILY,
        defaultAccountIdForTenant(FAMILY),
        defaultCategoryIdForTenant(FAMILY, "food"),
        date,
        -amountMinor,
      );
  return { call, send, arrival, overview, spend, notify };
}

describe("family remittances", () => {
  it("counts a send only once someone at home confirms what arrived", async () => {
    const { call, send, arrival, overview, notify } = await setup();

    const sent = await send("kuya", {});
    const before = await overview();
    const confirmed = await call("mama", "POST", `/${sent.id}/receive`, arrival(2_815_000));
    const twice = await call("kuya", "POST", `/${sent.id}/receive`, arrival(2_815_000));
    const after = await overview();

    expect(sent.received).toBeNull();
    expect(before).toMatchObject({ hasRemittances: true, leftMinor: 0, month: { sentMinor: 0 } });
    expect(before.pending.map((item) => item.id)).toEqual([sent.id]);
    expect(confirmed.status).toBe(200);
    expect(twice.status).toBe(409);
    expect(after).toMatchObject({ leftMinor: 2_815_000, month: { sentMinor: 2_815_000 } });
    expect(after.pending).toEqual([]);
    expect(after.recent[0]!.received).toMatchObject({ amountMinor: 2_815_000, byUserId: "mama" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![1]).toMatchObject({
      category: "remittance_received",
      exceptUserId: "mama",
    });
  });

  it("records both steps at once and keeps months apart in the history", async () => {
    const { send, arrival, overview, spend } = await setup();
    await send("kuya", { sentOn: "2026-09-01", received: arrival(1_000_000, "2026-09-02") });
    await send("kuya", { received: arrival(500_000) });
    spend(300_000, "2026-09-10");
    spend(120_000, "2026-10-05");

    const result = await overview();

    expect(result.month).toEqual({ month: MONTH, sentMinor: 500_000, spentMinor: 120_000 });
    expect(result.history).toEqual([
      { month: "2026-09-01", sentMinor: 1_000_000, spentMinor: 300_000 },
    ]);
    expect(result.leftMinor).toBe(1_500_000 - 420_000);
  });

  it("lets viewers only watch, and only the sender or owner cancel a pending send", async () => {
    const { call, send, overview } = await setup();
    const sent = await send("kuya", {});

    const byViewer = await call("lola", "POST", "", {
      sentAmountMinor: 1,
      sentCurrency: "USD",
      sentOn: "2026-10-02",
    });
    const byLola = await call("lola", "DELETE", `/${sent.id}`);
    const byMama = await call("mama", "DELETE", `/${sent.id}`);

    expect(byViewer.status).toBe(403);
    expect(byLola.status).toBe(403);
    expect(byMama.status).toBe(204);
    expect((await overview()).pending).toEqual([]);
  });
});
