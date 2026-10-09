import { CURRENT_ASSISTANT_CONSENT_VERSION } from "@zoption/shared";
import type {
  AccountRecord,
  AssistantAction,
  AssistantActionToolInput,
  CategoryRecord,
  Debt,
  FinancialGoal,
  SubscriptionRecord,
  TransactionListItem,
} from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proposeAction, type ActionRecords } from "../src/assistant/actions";
import type { AssistantOrchestrator } from "../src/assistant/orchestrator";
import { createAssistantService } from "../src/assistant/service";
import { createAssistantTurnPolicy } from "../src/assistant/turn-policy";
import { assistantRepository } from "../src/db/assistant";
import { assistantActionRepository } from "../src/db/assistant-actions";
import { assistantTransactionDraftRepository } from "../src/db/assistant-transaction-drafts";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT = "user:tenant-a";
const THREAD = "11111111-1111-4111-8111-111111111111";
const FIRST = "22222222-2222-4222-8222-222222222222";
const SECOND = "33333333-3333-4333-8333-333333333333";

const records: ActionRecords = {
  accounts: [
    {
      id: "account-gcash",
      name: "GCash",
      type: "other",
      currency: "PHP",
      balanceMinor: 120_000,
      archived: false,
    },
  ] as AccountRecord[],
  categories: [
    {
      id: "category-streaming",
      name: "Streaming",
      kind: "expense",
      archived: false,
      locked: false,
    },
  ] as CategoryRecord[],
  goals: [
    {
      id: "goal-1",
      name: "Emergency fund",
      targetAmountMinor: 5_000_000,
      currentAmountMinor: 100_000,
      targetDate: "2027-06-30",
      status: "active",
    },
  ] as FinancialGoal[],
  debts: [
    {
      id: "debt-1",
      name: "Visa",
      type: "credit_card",
      balanceMinor: 2_000_000,
      aprBasisPoints: 3_600,
      minimumPaymentMinor: 100_000,
      balanceAsOf: "2026-08-01",
      status: "active",
    },
  ] as Debt[],
  subscriptions: [
    {
      id: "sub-1",
      name: "Netflix",
      amountMinor: 54_900,
      currency: "PHP",
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      status: "active",
      categoryId: "category-streaming",
      categoryName: "Streaming",
      accountId: "account-gcash",
      accountName: "GCash",
    },
  ] as SubscriptionRecord[],
  transactions: [
    {
      id: "tx-1",
      date: "2026-08-01",
      description: "Jollibee",
      amountMinor: -25_000,
      currency: "PHP",
      kind: "expense",
      categoryId: "category-streaming",
    },
    {
      id: "tx-2",
      date: "2026-08-02",
      description: "Jollibee",
      amountMinor: -31_000,
      currency: "PHP",
      kind: "expense",
      categoryId: "category-streaming",
    },
  ] as TransactionListItem[],
};

function propose(
  input: Partial<AssistantActionToolInput> & { action: AssistantActionToolInput["action"] },
) {
  return proposeAction({ currentDate: "2026-08-02", ...input }, records, "PHP");
}

describe("proposeAction", () => {
  it("builds a subscription in minor units from names and exact decimals", () => {
    const result = propose({
      action: "create_subscription",
      name: "Spotify",
      amount: "149.50",
      billingCycle: "monthly",
      date: "2026-09-05",
      categoryName: "streaming",
      accountName: "GCash",
    });
    expect(result.action).toMatchObject({
      kind: "create_subscription",
      status: "pending",
      input: {
        name: "Spotify",
        amountMinor: 14_950,
        accountId: "account-gcash",
        categoryId: "category-streaming",
      },
    });
    expect(result.action?.summary).toContain("PHP 149.50");
    expect(JSON.stringify(result.envelope)).not.toContain("account-gcash");
  });

  it("asks for missing details instead of guessing", () => {
    const result = propose({ action: "create_debt", name: "Car loan", amount: "500000" });
    expect(result.action).toBeUndefined();
    expect(result.envelope.data).toMatchObject({
      status: "missing_details",
      missing: ["debtType", "apr", "minimumPayment"],
    });
  });

  it("converts an APR percentage to basis points", () => {
    const result = propose({
      action: "create_debt",
      name: "Car loan",
      debtType: "auto_loan",
      amount: "500000",
      apr: "7.25",
      minimumPayment: "12000",
    });
    expect(result.action).toMatchObject({
      input: { aprBasisPoints: 725, balanceMinor: 50_000_000, balanceAsOf: "2026-08-02" },
    });
  });

  it("finds a record by a partial name and lists choices when it cannot", () => {
    expect(propose({ action: "delete_subscription", target: "netflix" }).action).toMatchObject({
      kind: "delete_subscription",
      targetId: "sub-1",
    });
    expect(propose({ action: "delete_goal", target: "vacation" }).envelope.data).toMatchObject({
      status: "target_not_found",
      available: ["Emergency fund"],
    });
  });

  it("keeps unchanged subscription fields and rejects an empty update", () => {
    const result = propose({ action: "update_subscription", target: "Netflix", amount: "649" });
    expect(result.action).toMatchObject({
      input: {
        name: "Netflix",
        amountMinor: 64_900,
        billingCycle: "monthly",
        accountId: "account-gcash",
      },
    });
    expect(propose({ action: "update_subscription", target: "Netflix" }).action).toBeUndefined();
  });

  it("refuses a goal update that leaves savings above the target", () => {
    const result = propose({
      action: "update_goal",
      target: "Emergency fund",
      currentAmount: "60000",
    });
    expect(result.action).toBeUndefined();
  });
});

describe("proposeAction for accounts", () => {
  it("proposes a new account and refuses a duplicate name", () => {
    const created = propose({ action: "create_account", name: "Maya", accountType: "virtual" });
    expect(created.action).toMatchObject({
      kind: "create_account",
      input: { name: "Maya", type: "virtual" },
    });
    expect(
      propose({ action: "create_account", name: "gcash", accountType: "cash" }).envelope.data,
    ).toMatchObject({ status: "invalid" });
    expect(propose({ action: "create_account", name: "Maya" }).envelope.data).toMatchObject({
      status: "missing_details",
      missing: ["accountType"],
    });
  });

  it("describes a balance adjustment from the current balance", () => {
    const result = propose({ action: "adjust_balance", target: "GCash", amount: "1000" });
    expect(result.action).toMatchObject({
      kind: "adjust_balance",
      targetId: "account-gcash",
      input: { newBalanceMinor: 100_000 },
    });
    expect(result.action?.summary).toContain("PHP 1,200.00 to PHP 1,000.00");
    expect(result.action?.summary).toContain("PHP 200.00 expense");
    expect(
      propose({ action: "adjust_balance", target: "GCash", amount: "1200" }).envelope.data,
    ).toMatchObject({ status: "already_matches" });
  });
});

describe("proposeAction for categories, budgets, and transactions", () => {
  it("renames a category and refuses a duplicate name", () => {
    expect(
      propose({ action: "update_category", target: "streaming", name: "Media" }).action,
    ).toMatchObject({
      kind: "update_category",
      targetId: "category-streaming",
      input: { name: "Media" },
    });
    expect(
      propose({ action: "create_category", name: "streaming", categoryKind: "expense" }).action,
    ).toBe(undefined);
  });

  it("sets a monthly budget in minor units for the named month", () => {
    const result = propose({
      action: "set_budget",
      categoryName: "Streaming",
      amount: "3000",
      date: "2026-09-15",
    });
    expect(result.action).toMatchObject({
      kind: "set_budget",
      targetId: "category-streaming",
      input: { month: "2026-09-01", limitMinor: 300_000 },
    });
  });

  it("asks which transaction when several match, then finds one by amount", () => {
    const many = propose({ action: "delete_transaction", target: "Jollibee" });
    expect(many.action).toBeUndefined();
    expect(many.envelope.data).toMatchObject({ status: "target_ambiguous" });
    const one = propose({ action: "delete_transaction", target: "Jollibee", matchAmount: "310" });
    expect(one.action).toMatchObject({ kind: "delete_transaction", targetId: "tx-2" });
  });

  it("edits only the fields the user changed on a transaction", () => {
    const result = propose({
      action: "update_transaction",
      target: "Jollibee",
      matchAmount: "250",
      amount: "275.50",
    });
    expect(result.action).toMatchObject({
      kind: "update_transaction",
      targetId: "tx-1",
      input: { amountMinor: 27_550 },
    });
  });
});

describe("assistant turn policy for actions", () => {
  const base = {
    history: [],
    currentDate: "2026-08-02",
    timeZone: "Asia/Manila",
    transactionBounds: null,
  };
  it("does not ask for a month when the user adds a subscription", () => {
    const policy = createAssistantTurnPolicy({
      ...base,
      message: "Add a Netflix subscription for 549 monthly",
    });
    expect(policy).toMatchObject({ actionFlow: true, requiredToolGroups: [] });
    expect(policy.deterministicResponse).toBeUndefined();
  });

  it("treats an account or balance change as an action, not a balance question", () => {
    for (const message of ["Create a new account called Maya", "Adjust my GCash balance to 1000"]) {
      expect(createAssistantTurnPolicy({ ...base, message }).actionFlow).toBe(true);
    }
    expect(
      createAssistantTurnPolicy({ ...base, message: "What is my account balance?" }).actionFlow,
    ).toBeUndefined();
  });

  it("answers a how-to question without records, tools, or a period question", () => {
    for (const message of [
      "How do I import a bank statement?",
      "How do I set a budget for groceries?",
      "Paano mag-export ng transactions?",
    ]) {
      const policy = createAssistantTurnPolicy({ ...base, message });
      expect(policy.requiredToolGroups).toEqual([]);
      expect(policy.deterministicResponse).toBeUndefined();
      expect(policy.actionFlow).toBeUndefined();
    }
  });

  it("keeps a spending question that starts with how as a records question", () => {
    const policy = createAssistantTurnPolicy({
      ...base,
      message: "How much did I spend on food this month?",
    });
    expect(policy.requiredToolGroups.length).toBeGreaterThan(0);
  });

  it("still reads a plain subscription question as a records question", () => {
    const policy = createAssistantTurnPolicy({
      ...base,
      message: "What are my recurring subscription charges this month?",
    });
    expect(policy.actionFlow).toBeUndefined();
  });
});

const databases: Array<{ close(): void }> = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function setupConfirm() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT);
  database
    .prepare(
      `INSERT INTO assistant_preferences
       (tenant_id, consented_at, consent_version, assistant_name, user_preferred_name)
       VALUES (?, '2026-08-01T00:00:00.000Z', ?, 'Aster', 'Sam')`,
    )
    .run(TENANT, CURRENT_ASSISTANT_CONSENT_VERSION);
  database
    .prepare(
      `INSERT INTO assistant_threads (id, tenant_id, title, last_message_at, retention_expires_at)
       VALUES (?, ?, 'Goals', '2026-08-02T00:00:00.000Z', '2999-01-01T00:00:00.000Z')`,
    )
    .run(THREAD, TENANT);
  const insert = (id: string, createdAt: string, action: AssistantAction) =>
    database
      .prepare(
        `INSERT INTO assistant_messages
         (id, tenant_id, thread_id, role, content, status, response_metadata_json, created_at)
         VALUES (?, ?, ?, 'assistant', 'Review it.', 'completed', ?, ?)`,
      )
      .run(
        id,
        TENANT,
        THREAD,
        JSON.stringify({
          promptVersion: "expert-v7",
          compliance: { posture: "budgeting_allowed", topics: [] },
          sources: [],
          assistantActionFlow: true,
          assistantAction: action,
        }),
        createdAt,
      );
  const goal: AssistantAction = {
    kind: "create_goal",
    status: "pending",
    summary: "Add savings goal Trip",
    input: {
      name: "Trip",
      targetAmountMinor: 3_000_000,
      currentAmountMinor: 0,
      targetDate: "2027-01-31",
      status: "active",
    },
  };
  insert(FIRST, "2026-08-02T00:00:00.000Z", goal);
  const goals = { create: vi.fn(async () => ({}) as never), update: vi.fn(), remove: vi.fn() };
  const transactions = {
    create: vi.fn(async () => ({}) as never),
    update: vi.fn(async () => ({}) as never),
    remove: vi.fn(async () => undefined),
  };
  const budgets = { upsert: vi.fn(async () => ({}) as never) };
  const categoryUpdate = vi.fn(async () => ({}) as never);
  const env = { DB: binding } as unknown as Bindings;
  const service = createAssistantService(
    assistantRepository,
    {} as AssistantOrchestrator,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { drafts: assistantTransactionDraftRepository, transactions: { create: vi.fn() } },
    {
      actions: assistantActionRepository,
      subscriptions: { create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
      goals,
      debts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
      accounts: {
        list: vi.fn(async () => [...records.accounts]),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      categories: {
        list: vi.fn(
          async () =>
            [{ id: "category-adjust", name: "Uncategorized", kind: "expense" }] as CategoryRecord[],
        ),
        create: vi.fn(),
        update: categoryUpdate,
      },
      budgets,
      transactions,
    },
  );
  return { env, service, goals, transactions, budgets, categoryUpdate, insert, goal };
}

describe("assistant action confirmation", () => {
  it("applies the stored proposal once and marks it done", async () => {
    const { env, service, goals } = setupConfirm();
    const done = await service.confirmAction(env, TENANT, FIRST);
    const again = await service.confirmAction(env, TENANT, FIRST);
    expect(goals.create).toHaveBeenCalledTimes(1);
    expect(goals.create).toHaveBeenCalledWith(
      env,
      TENANT,
      expect.objectContaining({ name: "Trip" }),
    );
    expect(done.metadata?.assistantAction?.status).toBe("done");
    expect(again.metadata?.assistantAction?.status).toBe("done");
  });

  it("refuses a proposal a later one replaced", async () => {
    const { env, service, goals, insert, goal } = setupConfirm();
    insert(SECOND, "2026-08-02T00:05:00.000Z", goal);
    await expect(service.confirmAction(env, TENANT, FIRST)).rejects.toMatchObject({
      code: "assistant_action_superseded",
    });
    expect(goals.create).not.toHaveBeenCalled();
  });

  it("releases the claim when applying fails so the user can retry", async () => {
    const { env, service, goals } = setupConfirm();
    goals.create.mockRejectedValueOnce(new Error("boom"));
    await expect(service.confirmAction(env, TENANT, FIRST)).rejects.toThrow("boom");
    const retried = await service.confirmAction(env, TENANT, FIRST);
    expect(retried.metadata?.assistantAction?.status).toBe("done");
  });

  it("books a balance adjustment against the current balance, keyed on the reply", async () => {
    const { env, service, transactions, insert } = setupConfirm();
    const adjust: AssistantAction = {
      kind: "adjust_balance",
      status: "pending",
      summary: "Set GCash balance",
      targetId: "account-gcash",
      targetName: "GCash",
      input: { newBalanceMinor: 100_000 },
    };
    insert(SECOND, "2026-08-02T00:05:00.000Z", adjust);
    await service.confirmAction(env, TENANT, SECOND);
    expect(transactions.create).toHaveBeenCalledWith(
      env,
      TENANT,
      expect.objectContaining({
        kind: "expense",
        amountMinor: 20_000,
        accountId: "account-gcash",
        categoryId: "category-adjust",
      }),
      { id: SECOND },
    );
  });

  it("applies a category archive, a budget limit, and a transaction delete", async () => {
    const { env, service, transactions, budgets, categoryUpdate, insert } = setupConfirm();
    const base = { status: "pending" as const, summary: "x" };
    insert("33333333-3333-4333-8333-333333333331", "2026-08-02T00:01:00.000Z", {
      ...base,
      kind: "set_budget",
      targetId: "category-streaming",
      targetName: "Streaming",
      input: { month: "2026-08-01", limitMinor: 300_000 },
    });
    await service.confirmAction(env, TENANT, "33333333-3333-4333-8333-333333333331");
    expect(budgets.upsert).toHaveBeenCalledWith(env, TENANT, {
      scope: "month",
      month: "2026-08-01",
      items: [{ categoryId: "category-streaming", limitMinor: 300_000 }],
    });
    insert("33333333-3333-4333-8333-333333333332", "2026-08-02T00:02:00.000Z", {
      ...base,
      kind: "archive_category",
      targetId: "category-streaming",
      targetName: "Streaming",
    });
    await service.confirmAction(env, TENANT, "33333333-3333-4333-8333-333333333332");
    expect(categoryUpdate).toHaveBeenCalledWith(env, TENANT, "category-streaming", {
      archived: true,
    });
    insert("33333333-3333-4333-8333-333333333333", "2026-08-02T00:03:00.000Z", {
      ...base,
      kind: "delete_transaction",
      targetId: "tx-1",
      targetName: "Jollibee",
    });
    await service.confirmAction(env, TENANT, "33333333-3333-4333-8333-333333333333");
    expect(transactions.remove).toHaveBeenCalledWith(env, TENANT, "tx-1");
  });

  it("returns 404 for a reply with no proposal", async () => {
    const { env, service } = setupConfirm();
    await expect(
      service.confirmAction(env, TENANT, "99999999-9999-4999-8999-999999999999"),
    ).rejects.toMatchObject({ code: "assistant_action_not_found" });
  });
});
