import {
  familyRemittanceReceiveSchema,
  familyRemittanceSendSchema,
  mobileSyncRemittanceSnapshotSchema,
  type FamilyRemittanceReceiveInput,
  type FamilyRemittanceSendInput,
} from "@zoption/shared";
import { z } from "zod";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, uuidSchema, validateLocalReferences } from "../model";
import { assertNoAttemptInFlight, assertRowSettled } from "./outbox-writes";

// A family remittance moves one way: sent, then received (which books its income entry), or
// cancelled before it arrives. The Worker records the sender and receiver as the pusher.

const remittanceRowSchema = z.object({
  id: z.string(),
  sent_by_user_id: z.string(),
  sent_amount_minor: z.number().int(),
  sent_currency: z.string(),
  fee_minor: z.number().int(),
  provider: z.string().nullable(),
  sent_on: z.string(),
  note: z.string().nullable(),
  transaction_id: z.string().nullable(),
  received_by_user_id: z.string().nullable(),
  server_revision: z.number().int(),
  server_updated_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
type RemittanceRow = z.infer<typeof remittanceRowSchema>;

/** The income entry a remittance becomes; the Worker names it the same way. */
export function arrivalDescription(provider: string | null | undefined): string {
  return provider ? `Remittance via ${provider}` : "Remittance";
}

async function currentRemittance(ctx: LocalCommandContext, id: string): Promise<RemittanceRow> {
  const row = remittanceRowSchema.safeParse(
    await ctx.database.getFirstAsync(
      "SELECT * FROM remittances WHERE id = ? AND deleted_at IS NULL",
      id,
    ),
  );
  if (!row.success) {
    throw new LocalMutationError(
      "This remittance is no longer on this phone.",
      "remittance_missing",
    );
  }
  return row.data;
}

function snapshot(row: RemittanceRow) {
  return mobileSyncRemittanceSnapshotSchema.parse({
    id: row.id,
    sentByUserId: row.sent_by_user_id,
    sentAmountMinor: row.sent_amount_minor,
    sentCurrency: row.sent_currency,
    feeMinor: row.fee_minor,
    provider: row.provider,
    sentOn: row.sent_on,
    note: row.note,
    transactionId: row.transaction_id,
    receivedByUserId: row.received_by_user_id,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  });
}

/** Books the arrival's income entry locally under `transactionId`; it uploads with the remittance. */
async function insertArrival(
  ctx: LocalCommandContext,
  transactionId: string,
  userId: string,
  provider: string | null | undefined,
  arrival: FamilyRemittanceReceiveInput,
): Promise<string[]> {
  const currency = await ctx.database.getFirstAsync<{ currency: string }>(
    "SELECT currency FROM accounts WHERE id = ?",
    arrival.accountId,
  );
  const dependencyIds = await validateLocalReferences(
    ctx.database,
    {
      kind: "income",
      accountId: arrival.accountId,
      categoryId: arrival.categoryId,
      date: arrival.date,
      description: arrivalDescription(provider),
      amountMinor: arrival.amountMinor,
      currency: (currency?.currency ?? "PHP") as "PHP",
    },
    true,
  );
  await ctx.database.runAsync(
    `INSERT INTO transactions (
      id, account_id, category_id, date, description, amount_minor, currency, kind,
      author_user_id, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'income', ?, 0, NULL, NULL, 'pending')`,
    transactionId,
    arrival.accountId,
    arrival.categoryId,
    arrival.date,
    arrivalDescription(provider),
    arrival.amountMinor,
    currency?.currency ?? "PHP",
    userId,
  );
  return dependencyIds;
}

async function insertOutbox(
  ctx: LocalCommandContext,
  operation: {
    entityId: string;
    type: "create" | "update" | "delete";
    baseRevision: number;
    payload: unknown;
    dependencyIds: string[];
    base: unknown;
  },
): Promise<void> {
  await ctx.database.runAsync(
    `INSERT INTO sync_outbox (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, base_json, created_sequence
    ) VALUES (?, ?, 'remittance', ?, ?, ?, ?, ?, ?, ?)`,
    uuidSchema.parse(ctx.randomUuid()),
    uuidSchema.parse(ctx.randomUuid()),
    operation.entityId,
    operation.type,
    operation.baseRevision,
    JSON.stringify(operation.payload),
    JSON.stringify(operation.dependencyIds),
    JSON.stringify(operation.base),
    await ctx.store.nextSequence(),
  );
}

/** Records a send by `userId`, and its arrival too when `received` is already known. */
export function sendRemittance(
  ctx: LocalCommandContext,
  userId: string,
  value: FamilyRemittanceSendInput,
): Promise<string> {
  const input = familyRemittanceSendSchema.parse(value);
  return ctx.writer.run(async () => {
    let id = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.clientId();
      id = uuidSchema.parse(ctx.randomUuid());
      const transactionId = input.received ? uuidSchema.parse(ctx.randomUuid()) : null;
      const dependencyIds =
        input.received && transactionId
          ? await insertArrival(ctx, transactionId, userId, input.provider, input.received)
          : [];
      await ctx.database.runAsync(
        `INSERT INTO remittances (
          id, sent_by_user_id, sent_amount_minor, sent_currency, fee_minor, provider, sent_on,
          note, transaction_id, received_by_user_id, server_revision, sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
        id,
        userId,
        input.sentAmountMinor,
        input.sentCurrency,
        input.feeMinor ?? 0,
        input.provider || null,
        input.sentOn,
        input.note || null,
        transactionId,
        transactionId ? userId : null,
      );
      await insertOutbox(ctx, {
        entityId: id,
        type: "create",
        baseRevision: 0,
        payload: {
          ...input,
          ...(input.received && transactionId
            ? { received: { ...input.received, transactionId } }
            : {}),
        },
        dependencyIds,
        base: {},
      });
    });
    return id;
  });
}

/** Confirms a send arrived, booking its income entry to the chosen account and category. */
export function receiveRemittance(
  ctx: LocalCommandContext,
  userId: string,
  id: string,
  value: FamilyRemittanceReceiveInput,
): Promise<void> {
  const arrival = familyRemittanceReceiveSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await currentRemittance(ctx, id);
      assertRowSettled(current.sync_state, "remittance", "editing");
      if (current.transaction_id) {
        throw new LocalMutationError("This remittance already arrived.", "mutation_blocked");
      }
      const outbox = await ctx.store.currentOutbox("remittance", id);
      assertNoAttemptInFlight(outbox, "remittance", "editing");
      const transactionId = uuidSchema.parse(ctx.randomUuid());
      const dependencyIds = await insertArrival(
        ctx,
        transactionId,
        userId,
        current.provider,
        arrival,
      );
      await ctx.database.runAsync(
        `UPDATE remittances SET transaction_id = ?, received_by_user_id = ?, sync_state = 'pending'
         WHERE id = ?`,
        transactionId,
        userId,
        id,
      );
      const received = { ...arrival, transactionId };
      // A send not uploaded yet carries its arrival in the same create.
      if (outbox?.operation_type === "create") {
        const payload = familyRemittanceSendSchema.parse(JSON.parse(outbox.payload_json));
        await ctx.database.runAsync(
          "UPDATE sync_outbox SET payload_json = ?, dependency_ids_json = ? WHERE operation_id = ?",
          JSON.stringify({ ...payload, received }),
          JSON.stringify([
            ...new Set([
              ...z.array(z.string()).parse(JSON.parse(outbox.dependency_ids_json)),
              ...dependencyIds,
            ]),
          ]),
          outbox.operation_id,
        );
        return;
      }
      await insertOutbox(ctx, {
        entityId: id,
        type: "update",
        baseRevision: current.server_revision,
        payload: received,
        dependencyIds,
        base: snapshot(current),
      });
    });
  });
}

/** Cancels a send that has not arrived; one never uploaded simply goes. */
export function cancelRemittance(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await currentRemittance(ctx, id);
      assertRowSettled(current.sync_state, "remittance", "deleting");
      if (current.transaction_id) {
        throw new LocalMutationError(
          "A remittance that arrived cannot be cancelled. Delete its income entry instead.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("remittance", id);
      assertNoAttemptInFlight(outbox, "remittance", "deleting");
      if (outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM remittances WHERE id = ?", id);
        return;
      }
      await insertOutbox(ctx, {
        entityId: id,
        type: "delete",
        baseRevision: current.server_revision,
        payload: {},
        dependencyIds: [],
        base: snapshot(current),
      });
      await ctx.database.runAsync(
        "UPDATE remittances SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}

/**
 * Drops a remittance change the family refused or that conflicts (someone else confirmed or
 * cancelled it first), and puts back the family's version: the conflict's server copy, or the
 * last synced state. A local arrival entry that never uploaded goes with it.
 */
export function discardRemittanceChange(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const row = remittanceRowSchema.safeParse(
        await ctx.database.getFirstAsync("SELECT * FROM remittances WHERE id = ?", id),
      );
      const outbox = await ctx.store.currentOutbox("remittance", id);
      if (!row.success || !outbox || (outbox.state !== "failed" && outbox.state !== "conflicted")) {
        throw new LocalMutationError(
          "This remittance has no refused change to discard.",
          "mutation_blocked",
        );
      }
      const conflict = await ctx.database.getFirstAsync<{ server_json: string }>(
        `SELECT server_json FROM sync_conflicts
         WHERE entity_type = 'remittance' AND entity_id = ? AND resolved_at IS NULL`,
        id,
      );
      await ctx.database.runAsync(
        `UPDATE sync_conflicts SET resolved_at = ?, resolution = 'keep_server', operation_id = NULL
         WHERE entity_type = 'remittance' AND entity_id = ? AND resolved_at IS NULL`,
        ctx.now().toISOString(),
        id,
      );
      await ctx.database.runAsync(
        "DELETE FROM sync_outbox WHERE operation_id = ?",
        outbox.operation_id,
      );
      const server = conflict
        ? mobileSyncRemittanceSnapshotSchema.nullable().parse(JSON.parse(conflict.server_json))
        : null;
      // The local arrival entry, unless the family's version booked the same one.
      const localArrival = row.data.transaction_id;
      if (localArrival && localArrival !== server?.transactionId) {
        await ctx.database.runAsync(
          `DELETE FROM transactions WHERE id = ? AND server_revision = 0
           AND NOT EXISTS (
             SELECT 1 FROM sync_outbox WHERE entity_type = 'transaction' AND entity_id = ?
           )`,
          localArrival,
          localArrival,
        );
      }
      if (server) {
        await ctx.database.runAsync(
          `UPDATE remittances SET transaction_id = ?, received_by_user_id = ?,
            server_revision = ?, server_updated_at = ?, deleted_at = NULL, sync_state = 'synced'
           WHERE id = ?`,
          server.transactionId,
          server.receivedByUserId,
          server.revision,
          server.updatedAt,
          id,
        );
        return;
      }
      if (outbox.operation_type === "create" || conflict) {
        // Never reached the family, or the family no longer has it.
        await ctx.database.runAsync("DELETE FROM remittances WHERE id = ?", id);
        return;
      }
      // A refused receive or cancel: back to the send as last synced.
      await ctx.database.runAsync(
        `UPDATE remittances SET
          transaction_id = CASE WHEN ? = 'update' THEN NULL ELSE transaction_id END,
          received_by_user_id = CASE WHEN ? = 'update' THEN NULL ELSE received_by_user_id END,
          deleted_at = NULL, sync_state = 'synced'
         WHERE id = ?`,
        outbox.operation_type,
        outbox.operation_type,
        id,
      );
    });
  });
}
