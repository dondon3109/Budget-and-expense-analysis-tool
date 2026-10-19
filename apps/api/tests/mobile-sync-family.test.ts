import type { DatabaseSync } from "node:sqlite";

import {
  MOBILE_SYNC_FEATURES_HEADER,
  WORKSPACE_HEADER,
  type MobileSyncPullResponse,
  type MobileSyncPushOperation,
  type MobileSyncPushResponse,
} from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { familyJournal } from "../src/db/family-journal";
import { createMobileSyncRepository } from "../src/db/mobile-sync";
import {
  createTenantResolver,
  defaultAccountIdForTenant,
  defaultCategoryIdForTenant,
  starterStatements,
  tenantBootstrapRepository,
} from "../src/db/tenants";
import { HttpError } from "../src/errors";
import { createFamilyAlerts } from "../src/family-alerts";
import { createMobileSyncRoutes } from "../src/routes/mobile-sync";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family:dela-cruz";
const CLIENT = "50000000-0000-4000-8000-000000000001";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

let sequence = 0;
function operation(
  fields: Pick<MobileSyncPushOperation, "entityType" | "entityId" | "operationType"> & {
    baseRevision?: number;
    payload?: unknown;
  },
): MobileSyncPushOperation {
  sequence += 1;
  const suffix = String(sequence).padStart(4, "0");
  return {
    operationId: `50000000-0000-4000-8000-00000001${suffix}`,
    idempotencyKey: `50000000-0000-4000-8000-00000002${suffix}`,
    baseRevision: 0,
    dependencyIds: [],
    ...fields,
  } as MobileSyncPushOperation;
}

function expense(description: string) {
  return {
    kind: "expense" as const,
    date: "2026-10-17",
    description,
    amountMinor: 50_000,
    currency: "PHP" as const,
    accountId: defaultAccountIdForTenant(FAMILY),
    categoryId: defaultCategoryIdForTenant(FAMILY, "food"),
  };
}

/** Mama owns the family, Kuya is a member, and Lola views it. */
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

  const alerts = { ...createFamilyAlerts({ notify: async () => undefined }) };
  alerts.afterExpense = vi.fn(async () => undefined);
  const notifier = { notify: vi.fn(async () => undefined) };
  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.route(
    "/api/app/sync",
    createMobileSyncRoutes(
      createMobileSyncRepository(async () => false),
      {
        journal: familyJournal,
        alerts,
        notifier,
      },
    ),
  );
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = async (user: string, path: string, body: unknown, features = "family-workspaces") =>
    app.request(
      `/api/app/sync/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
          [WORKSPACE_HEADER]: FAMILY,
          [MOBILE_SYNC_FEATURES_HEADER]: features,
        },
        body: JSON.stringify(body),
      },
      env,
    );
  const push = async (user: string, ...operations: MobileSyncPushOperation[]) =>
    (await (
      await call(user, "push", { protocolVersion: 1, clientId: CLIENT, operations })
    ).json()) as MobileSyncPushResponse;
  const pull = async (user: string) =>
    (await (
      await call(user, "pull", { protocolVersion: 1, cursor: null })
    ).json()) as MobileSyncPullResponse;
  return { database, alerts, notifier, call, push, pull };
}

describe("mobile sync in a family", () => {
  it("records who added a pushed entry, shows them to everyone, and runs the expense alerts", async () => {
    const { alerts, push, pull } = await setup();
    const rice = "50000000-0000-4000-8000-000000000101";

    const pushed = await push(
      "kuya",
      operation({
        entityType: "transaction",
        entityId: rice,
        operationType: "create",
        payload: expense("Rice"),
      }),
    );
    const seen = (await pull("lola")).changes.find((change) => change.entityId === rice);

    expect(pushed.results[0]?.status).toBe("acknowledged");
    expect(seen?.payload).toMatchObject({ description: "Rice", authorUserId: "kuya" });
    expect(alerts.afterExpense).toHaveBeenCalledWith(
      expect.anything(),
      FAMILY,
      "kuya",
      expect.objectContaining({ id: rice, description: "Rice" }),
    );
  });

  it("lets a member change only their own entries and journals what changes", async () => {
    const { database, push } = await setup();
    const mamas = "50000000-0000-4000-8000-000000000201";
    const kuyas = "50000000-0000-4000-8000-000000000202";
    await push(
      "mama",
      operation({
        entityType: "transaction",
        entityId: mamas,
        operationType: "create",
        payload: expense("Eggs"),
      }),
    );
    await push(
      "kuya",
      operation({
        entityType: "transaction",
        entityId: kuyas,
        operationType: "create",
        payload: expense("Oil"),
      }),
    );

    const refused = await push(
      "kuya",
      operation({
        entityType: "transaction",
        entityId: mamas,
        operationType: "update",
        baseRevision: 1,
        payload: { description: "Mine now" },
      }),
      operation({
        entityType: "transaction",
        entityId: kuyas,
        operationType: "update",
        baseRevision: 1,
        payload: { description: "Cooking oil" },
      }),
    );
    const deleted = await push(
      "mama",
      operation({
        entityType: "transaction",
        entityId: kuyas,
        operationType: "delete",
        baseRevision: 2,
        payload: {},
      }),
    );

    expect(refused.results.map((result) => result.status)).toEqual(["rejected", "acknowledged"]);
    expect(deleted.results[0]?.status).toBe("acknowledged");
    expect(
      database
        .prepare(
          "SELECT transaction_id AS id, user_id AS userId, action FROM family_transaction_events ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: kuyas, userId: "kuya", action: "updated" },
      { id: kuyas, userId: "mama", action: "deleted" },
    ]);
  });

  it("lets viewers pull but not push, and refuses what a family does not have", async () => {
    const { call, push, pull } = await setup();

    const viewerPush = await call("lola", "push", {
      protocolVersion: 1,
      clientId: CLIENT,
      operations: [
        operation({
          entityType: "transaction",
          entityId: "50000000-0000-4000-8000-000000000301",
          operationType: "create",
          payload: expense("Bread"),
        }),
      ],
    });
    const goal = await push(
      "kuya",
      operation({
        entityType: "goal",
        entityId: "50000000-0000-4000-8000-000000000302",
        operationType: "create",
        payload: {
          name: "Laptop",
          targetAmountMinor: 100_000,
          currentAmountMinor: 0,
          targetDate: "2027-01-01",
          status: "active",
        },
      }),
    );
    const olderApp = await call("kuya", "pull", { protocolVersion: 1, cursor: null }, "debt-links");

    expect((await pull("lola")).changes.length).toBeGreaterThan(0);
    expect(viewerPush.status).toBe(403);
    expect(goal.results[0]).toMatchObject({ status: "rejected", code: "unsupported_operation" });
    expect(olderApp.status).toBe(400);
  });

  it("syncs a remittance from sent to received and tells the family it arrived", async () => {
    const { database, notifier, push, pull } = await setup();
    const send = "50000000-0000-4000-8000-000000000401";
    const mamasSend = "50000000-0000-4000-8000-000000000402";
    const income = "50000000-0000-4000-8000-000000000403";
    const sent = {
      sentAmountMinor: 20_000,
      sentCurrency: "USD" as const,
      provider: "Remitly",
      sentOn: "2026-10-15",
    };
    await push(
      "kuya",
      operation({
        entityType: "remittance",
        entityId: send,
        operationType: "create",
        payload: sent,
      }),
    );
    await push(
      "mama",
      operation({
        entityType: "remittance",
        entityId: mamasSend,
        operationType: "create",
        payload: sent,
      }),
    );

    const received = await push(
      "mama",
      operation({
        entityType: "remittance",
        entityId: send,
        operationType: "update",
        baseRevision: 1,
        payload: {
          transactionId: income,
          amountMinor: 1_120_000,
          accountId: defaultAccountIdForTenant(FAMILY),
          categoryId: defaultCategoryIdForTenant(FAMILY, "salary"),
          date: "2026-10-17",
        },
      }),
    );
    const cancels = await push(
      "kuya",
      operation({
        entityType: "remittance",
        entityId: send,
        operationType: "delete",
        baseRevision: 2,
        payload: {},
      }),
      operation({
        entityType: "remittance",
        entityId: mamasSend,
        operationType: "delete",
        baseRevision: 1,
        payload: {},
      }),
    );
    const changes = (await pull("lola")).changes;

    expect(received.results[0]?.status).toBe("acknowledged");
    expect(cancels.results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(changes.filter((change) => change.entityId === send).at(-1)?.payload).toMatchObject({
      sentByUserId: "kuya",
      transactionId: income,
      receivedByUserId: "mama",
      revision: 2,
    });
    expect(changes.find((change) => change.entityId === income)?.payload).toMatchObject({
      kind: "income",
      amountMinor: 1_120_000,
      description: "Remittance via Remitly",
      authorUserId: "mama",
    });
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "remittance_received", exceptUserId: "mama" }),
    );
    expect(database.prepare("SELECT COUNT(*) AS count FROM family_remittances").get()).toEqual({
      count: 2,
    });
  });
});
