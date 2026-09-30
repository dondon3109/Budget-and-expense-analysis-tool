import type {
  AssistantResponseMetadata,
  AssistantTransactionDraft,
  TransactionInput,
  TransactionListItem,
} from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssistantOrchestrator } from "../src/assistant/orchestrator";
import { createAssistantService } from "../src/assistant/service";
import { assistantRepository } from "../src/db/assistant";
import { assistantTransactionDraftRepository } from "../src/db/assistant-transaction-drafts";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT = "user:tenant-a";
const OTHER_TENANT = "user:tenant-b";
const THREAD = "11111111-1111-4111-8111-111111111111";
const MESSAGE = "22222222-2222-4222-8222-222222222222";

const draft: AssistantTransactionDraft = {
  status: "pending",
  kind: "expense",
  date: "2026-08-02",
  description: "Jollibee",
  amountMinor: 25_000,
  currency: "PHP",
  categoryId: "category-food",
  categoryName: "Food",
  accountId: "account-gcash",
  accountName: "GCash",
};

const databases: Array<{ close(): void }> = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function setup(
  metadata: Partial<AssistantResponseMetadata> = { transactionDraft: draft },
  rowAlreadyCreated?: boolean,
) {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  for (const tenant of [TENANT, OTHER_TENANT]) {
    database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(tenant);
  }
  database
    .prepare(
      `INSERT INTO assistant_threads (id, tenant_id, title, last_message_at, retention_expires_at)
       VALUES (?, ?, 'Lunch', '2026-08-02T00:00:00.000Z', '2999-01-01T00:00:00.000Z')`,
    )
    .run(THREAD, TENANT);
  database
    .prepare(
      `INSERT INTO assistant_messages
       (id, tenant_id, thread_id, role, content, status, response_metadata_json, created_at)
       VALUES (?, ?, ?, 'assistant', 'Review it and tap Save transaction.', 'completed', ?, '2026-08-02T00:00:00.000Z')`,
    )
    .run(
      MESSAGE,
      TENANT,
      THREAD,
      JSON.stringify({
        promptVersion: "expert-v3",
        compliance: { posture: "budgeting_allowed", topics: [] },
        sources: [],
        transactionEntry: true,
        ...metadata,
      }),
    );
  const env = { DB: binding } as unknown as Bindings;
  const create = vi.fn(
    async (_env: Bindings, _tenantId: string, input: TransactionInput, options?: { id?: string }) =>
      ({ id: options?.id, ...input }) as unknown as TransactionListItem,
  );
  const drafts = {
    ...assistantTransactionDraftRepository,
    transactionExists: vi.fn(
      rowAlreadyCreated === undefined
        ? assistantTransactionDraftRepository.transactionExists
        : async () => rowAlreadyCreated,
    ),
  };
  const service = createAssistantService(
    assistantRepository,
    {} as AssistantOrchestrator,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { drafts, transactions: { create } },
  );
  return { env, database, create, drafts, service };
}

describe("assistant transaction draft confirmation", () => {
  it("saves the stored draft once and records the saved transaction", async () => {
    const { env, create, service } = setup();

    const saved = await service.confirmTransactionDraft(env, TENANT, MESSAGE);
    const again = await service.confirmTransactionDraft(env, TENANT, MESSAGE);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      env,
      TENANT,
      {
        kind: "expense",
        date: "2026-08-02",
        description: "Jollibee",
        amountMinor: 25_000,
        currency: "PHP",
        categoryId: "category-food",
        accountId: "account-gcash",
      },
      { id: MESSAGE },
    );
    expect(saved.metadata?.transactionDraft).toMatchObject({
      status: "saved",
      transactionId: MESSAGE,
    });
    expect(again.metadata?.transactionDraft?.status).toBe("saved");
  });

  it("refuses a second save while the first is still in flight", async () => {
    const { env, service } = setup({
      transactionDraft: { ...draft, status: "saving", claimedAt: new Date().toISOString() },
    });
    await expect(service.confirmTransactionDraft(env, TENANT, MESSAGE)).rejects.toMatchObject({
      status: 409,
      code: "assistant_draft_in_progress",
    });
  });

  it("takes over a claim that a failed request left behind", async () => {
    const { env, create, service } = setup({
      transactionDraft: { ...draft, status: "saving", claimedAt: "2026-08-02T00:00:00.000Z" },
    });
    const saved = await service.confirmTransactionDraft(env, TENANT, MESSAGE);
    expect(create).toHaveBeenCalledTimes(1);
    expect(saved.metadata?.transactionDraft?.status).toBe("saved");
  });

  it("finds the row a request created before it died instead of creating a second", async () => {
    const { env, create, service } = setup(
      {
        transactionDraft: { ...draft, status: "saving", claimedAt: "2026-08-02T00:00:00.000Z" },
      },
      true,
    );
    const saved = await service.confirmTransactionDraft(env, TENANT, MESSAGE);
    expect(create).not.toHaveBeenCalled();
    expect(saved.metadata?.transactionDraft).toMatchObject({
      status: "saved",
      transactionId: MESSAGE,
    });
  });

  it("finds a seeded row by the reply's id through the real tenant-scoped lookup", async () => {
    const { env, database, create, service } = setup({
      transactionDraft: { ...draft, status: "saving", claimedAt: "2026-08-02T00:00:00.000Z" },
    });
    database.exec(`
      INSERT INTO categories (id, tenant_id, name, kind, color)
        VALUES ('category-food', '${TENANT}', 'Food', 'expense', '#123456');
      INSERT INTO transactions (id, tenant_id, category_id, date, description, amount_minor, kind)
        VALUES ('${MESSAGE}', '${TENANT}', 'category-food', '2026-08-02', 'Jollibee', -25000, 'expense');
    `);

    const saved = await service.confirmTransactionDraft(env, TENANT, MESSAGE);
    expect(create).not.toHaveBeenCalled();
    expect(saved.metadata?.transactionDraft).toMatchObject({
      status: "saved",
      transactionId: MESSAGE,
    });
  });

  it("refuses to save a draft a later correction replaced", async () => {
    const { env, database, create, service } = setup();
    database
      .prepare(
        `INSERT INTO assistant_messages
         (id, tenant_id, thread_id, role, content, status, response_metadata_json, created_at)
         VALUES ('33333333-3333-4333-8333-333333333333', ?, ?, 'assistant', 'Updated.', 'completed', ?, '2026-08-02T00:05:00.000Z')`,
      )
      .run(
        TENANT,
        THREAD,
        JSON.stringify({
          promptVersion: "expert-v3",
          compliance: { posture: "budgeting_allowed", topics: [] },
          sources: [],
          transactionDraft: { ...draft, amountMinor: 30_000 },
        }),
      );

    await expect(service.confirmTransactionDraft(env, TENANT, MESSAGE)).rejects.toMatchObject({
      status: 409,
      code: "assistant_draft_superseded",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("treats a create that lost the race to the original request as saved", async () => {
    const { env, create, drafts, service } = setup();
    drafts.transactionExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    create.mockRejectedValueOnce(new Error("UNIQUE constraint failed: transactions.id"));

    const saved = await service.confirmTransactionDraft(env, TENANT, MESSAGE);
    expect(saved.metadata?.transactionDraft?.status).toBe("saved");
  });

  it("returns the draft to pending when the save fails, so the user can retry", async () => {
    const { env, create, service } = setup();
    create.mockRejectedValueOnce(new Error("invalid account"));

    await expect(service.confirmTransactionDraft(env, TENANT, MESSAGE)).rejects.toThrow(
      "invalid account",
    );
    const retried = await service.confirmTransactionDraft(env, TENANT, MESSAGE);
    expect(retried.metadata?.transactionDraft?.status).toBe("saved");
  });

  it("never reaches another tenant's draft or a reply without one", async () => {
    const { env, create, service } = setup();
    await expect(service.confirmTransactionDraft(env, OTHER_TENANT, MESSAGE)).rejects.toMatchObject(
      { status: 404, code: "assistant_draft_not_found" },
    );

    const withoutDraft = setup({});
    await expect(
      withoutDraft.service.confirmTransactionDraft(withoutDraft.env, TENANT, MESSAGE),
    ).rejects.toMatchObject({ status: 404 });
    expect(create).not.toHaveBeenCalled();
  });
});
