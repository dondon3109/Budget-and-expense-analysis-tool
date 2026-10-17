import type { DatabaseSync } from "node:sqlite";

import { WORKSPACE_HEADER, type FamilyComment, type TransactionListItem } from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { familyCommentRepository } from "../src/db/family-comments";
import { familyJournal } from "../src/db/family-journal";
import {
  createTenantResolver,
  defaultAccountIdForTenant,
  defaultCategoryIdForTenant,
  starterStatements,
  tenantBootstrapRepository,
} from "../src/db/tenants";
import { transactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import { createFamilyAlerts } from "../src/family-alerts";
import type { FamilyNotifier } from "../src/family-notifier";
import { createFamilyAlertRoutes } from "../src/routes/family-alerts";
import { createFamilyCommentRoutes } from "../src/routes/family-comments";
import { createTransactionRoutes } from "../src/routes/transactions";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family:dela-cruz";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

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

  const notify = vi.fn<FamilyNotifier["notify"]>(async () => undefined);
  const alerts = createFamilyAlerts({ notify });
  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.route(
    "/api/app/transactions",
    createTransactionRoutes(transactionRepository, { journal: familyJournal, alerts }),
  );
  app.route(
    "/api/app/family/comments",
    createFamilyCommentRoutes(familyCommentRepository, { notify }),
  );
  app.route("/api/app/family/alerts", createFamilyAlertRoutes(alerts));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = (user: string, method: string, path: string, body?: unknown) =>
    app.request(
      path,
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
  const add = async (user: string, kind: "income" | "expense", amountMinor: number) =>
    (await (
      await call(user, "POST", "/api/app/transactions", {
        kind,
        date: "2026-10-17",
        description: kind === "income" ? "Padala" : "Rice",
        amountMinor,
        currency: "PHP",
        accountId: defaultAccountIdForTenant(FAMILY),
        categoryId: defaultCategoryIdForTenant(FAMILY, kind === "income" ? "salary" : "food"),
      })
    ).json()) as TransactionListItem;
  const comment = (user: string, path: string, body: string) =>
    call(user, "POST", `/api/app/family/comments/${path}`, { body });
  const categories = () => notify.mock.calls.map(([, notice]) => notice.category);
  return { env, database, call, add, comment, notify, categories, alerts };
}

describe("family comments", () => {
  it("notifies the entry's author and earlier commenters, never the commenter", async () => {
    const { call, add, comment, notify } = await setup();
    const rice = await add("kuya", "expense", 50_000);
    notify.mockClear();

    const fromMama = await comment("mama", `transaction/${rice.id}`, "Which store?");
    const fromKuya = await comment("kuya", `transaction/${rice.id}`, "Puregold");
    const fromLola = await comment("lola", `transaction/${rice.id}`, "Hello");
    const thread = (await (
      await call("lola", "GET", `/api/app/family/comments/transaction/${rice.id}`)
    ).json()) as { comments: FamilyComment[] };

    expect([fromMama.status, fromKuya.status, fromLola.status]).toEqual([201, 201, 403]);
    expect(thread.comments.map((item) => [item.userId, item.body])).toEqual([
      ["mama", "Which store?"],
      ["kuya", "Puregold"],
    ]);
    expect(notify.mock.calls.map(([, notice]) => notice.onlyUserIds)).toEqual([["kuya"], ["mama"]]);
    expect(notify.mock.calls[0]![1]).toMatchObject({
      category: "comment_reply",
      title: "New comment on “Rice”",
      body: "Which store?",
    });
  });

  it("lets only the writer or the owner remove a comment", async () => {
    const { add, comment, call } = await setup();
    const rice = await add("kuya", "expense", 50_000);
    const mine = (await (
      await comment("mama", `transaction/${rice.id}`, "Ok")
    ).json()) as FamilyComment;
    const kuyas = (await (
      await comment("kuya", `transaction/${rice.id}`, "Ok")
    ).json()) as FamilyComment;

    const byKuya = await call("kuya", "DELETE", `/api/app/family/comments/${mine.id}`);
    const byMama = await call("mama", "DELETE", `/api/app/family/comments/${kuyas.id}`);
    const missing = await comment("mama", "remittance/not-a-remittance", "Hi");

    expect(byKuya.status).toBe(404);
    expect(byMama.status).toBe(204);
    expect(missing.status).toBe(404);
  });
});

describe("family alerts", () => {
  it("tells the owner about a large expense and everyone once when money left runs low", async () => {
    const { call, add, notify, categories } = await setup();
    await add("mama", "income", 300_000);
    notify.mockClear();

    await add("kuya", "expense", 250_000);
    await add("kuya", "expense", 10_000);
    const byKuya = await call("kuya", "PUT", "/api/app/family/alerts", {
      spendingAlertMinor: null,
      lowBalanceMinor: null,
    });

    expect(categories()).toEqual(["family_spending", "low_balance"]);
    expect(notify.mock.calls[0]![1]).toMatchObject({ ownerOnly: true, exceptUserId: "kuya" });
    expect(notify.mock.calls[1]![1].body).toMatch(/500\.00 left after Rice/u);
    expect(byKuya.status).toBe(403);
  });

  it("stays quiet once the owner turns the alerts off", async () => {
    const { call, add, categories } = await setup();
    const saved = await call("mama", "PUT", "/api/app/family/alerts", {
      spendingAlertMinor: null,
      lowBalanceMinor: null,
    });

    await add("kuya", "expense", 900_000);

    expect(saved.status).toBe(200);
    expect(categories()).toEqual([]);
  });

  it("sends the owner one digest of yesterday's family entries", async () => {
    const { env, add, notify, alerts } = await setup();
    await add("mama", "income", 1_000_000);
    await add("kuya", "expense", 120_000);
    notify.mockClear();

    // 2026-10-18 01:00 in Manila: "yesterday" is the 17th.
    const sent = await alerts.sendDailyDigests(env, new Date("2026-10-17T17:00:00Z"));

    expect(sent).toBe(1);
    expect(notify.mock.calls[0]![1]).toMatchObject({
      category: "family_digest",
      ownerOnly: true,
      title: "Yesterday in Dela Cruz family",
    });
    expect(notify.mock.calls[0]![1].body).toMatch(
      /1,200\.00 spent across 2 entries\. .*8,800\.00 left\./u,
    );
  });
});
