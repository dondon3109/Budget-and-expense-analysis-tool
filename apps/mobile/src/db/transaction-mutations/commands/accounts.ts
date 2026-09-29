import {
  accountInputSchema,
  accountUpdateWithInterestSchema,
  interestUpdateSchema,
  mobileSyncAccountUpdateSchema,
  type AccountInput,
  type AccountInterestUpdate,
  type AccountUpdateWithInterest,
  type Currency,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, accountSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNotQueuedForRemoval,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
} from "./outbox-writes";

/**
 * `currency` is the workspace currency, which the Worker also assigns when the create syncs, so
 * the local row reads the same before and after the round trip.
 */
export function createAccount(
  ctx: LocalCommandContext,
  value: AccountInput,
  currency: Currency = "PHP",
): Promise<string> {
  const input = accountInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.store.assertUniqueName("account", input.name);
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO accounts (
          id, name, type, currency, archived, system, interest_json,
          server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, 0, 0, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.type,
        currency,
        JSON.stringify({
          enabled: false,
          annualRateBasisPoints: null,
          frequency: null,
          payDay: null,
        }),
      );
      await queueCreate(ctx, "account", entityId, input);
    });
    return entityId;
  });
}

export function updateAccount(
  ctx: LocalCommandContext,
  id: string,
  value: AccountUpdateWithInterest,
): Promise<void> {
  const update = accountUpdateWithInterestSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentAccount(id);
      assertRowSettled(current.sync_state, "account", "editing");
      if (current.system === 1 && update.name !== current.name) {
        throw new LocalMutationError("Permanent accounts cannot be renamed.", "mutation_blocked");
      }
      await ctx.store.assertUniqueName("account", update.name, id);
      const outbox = await ctx.store.currentOutbox("account", id);
      assertNotQueuedForRemoval(outbox, "account", "archived");
      assertNoAttemptInFlight(outbox, "account", "editing");
      const pending = outbox
        ? mobileSyncAccountUpdateSchema.safeParse(JSON.parse(outbox.payload_json) as unknown)
        : null;
      const next: AccountInput & { interest?: AccountInterestUpdate } = {
        name: update.name,
        type: update.type ?? current.type,
      };
      if (update.interest !== undefined && next.type !== "savings") {
        throw new LocalMutationError("Only savings accounts earn interest.", "mutation_blocked");
      }
      if (update.interest !== undefined) {
        next.interest = update.interest;
      } else if (
        next.type === "savings" &&
        pending?.success &&
        pending.data.interest !== undefined
      ) {
        next.interest = pending.data.interest;
      }
      await queueUpdate(ctx, outbox, {
        entityType: "account",
        entityId: id,
        baseRevision: current.server_revision,
        payload: next,
        base: () => accountSnapshot(current),
      });
      if (update.interest !== undefined) {
        await ctx.database.runAsync(
          "UPDATE accounts SET name = ?, type = ?, interest_json = ?, sync_state = 'pending' WHERE id = ?",
          next.name,
          next.type,
          JSON.stringify({
            enabled: update.interest.enabled,
            annualRateBasisPoints: update.interest.enabled
              ? update.interest.annualRateBasisPoints
              : null,
            frequency: update.interest.enabled ? update.interest.frequency : null,
            payDay: update.interest.enabled ? update.interest.payDay : null,
          }),
          id,
        );
      } else {
        await ctx.database.runAsync(
          "UPDATE accounts SET name = ?, type = ?, sync_state = 'pending' WHERE id = ?",
          next.name,
          next.type,
          id,
        );
      }
    });
  });
}

/** Requeues a rejected interest change after the user has confirmed their Pro access. */
export function retryAccountInterestSync(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentAccount(id);
      const outbox = await ctx.store.currentOutbox("account", id);
      if (
        current.sync_state !== "failed" ||
        !outbox ||
        outbox.state !== "failed" ||
        outbox.last_error_code !== "plan_limit"
      ) {
        throw new LocalMutationError(
          "This account is not waiting to retry an interest setting.",
          "mutation_blocked",
        );
      }
      let payload: unknown;
      try {
        payload = JSON.parse(outbox.payload_json) as unknown;
      } catch {
        throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
      }
      const parsed = mobileSyncAccountUpdateSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.interest === undefined ||
        (parsed.data.type ?? current.type) !== "savings"
      ) {
        throw new LocalMutationError(
          "This account is not waiting to retry an interest setting.",
          "mutation_blocked",
        );
      }
      await ctx.database.runAsync(
        `UPDATE sync_outbox SET state = 'pending', attempt_count = 0,
          next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
        outbox.operation_id,
      );
      await ctx.database.runAsync("UPDATE accounts SET sync_state = 'pending' WHERE id = ?", id);
    });
  });
}

export function updateAccountInterest(
  ctx: LocalCommandContext,
  id: string,
  value: AccountInterestUpdate,
): Promise<void> {
  const interest = interestUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentAccount(id);
      assertRowSettled(current.sync_state, "account", "editing");
      if (current.type !== "savings") {
        throw new LocalMutationError("Only savings accounts earn interest.", "mutation_blocked");
      }
      const outbox = await ctx.store.currentOutbox("account", id);
      assertNotQueuedForRemoval(outbox, "account", "archived");
      assertNoAttemptInFlight(outbox, "account", "editing");
      const next = outbox
        ? {
            ...mobileSyncAccountUpdateSchema.parse(JSON.parse(outbox.payload_json) as unknown),
            interest,
          }
        : { name: current.name, type: current.type, interest };
      await queueUpdate(ctx, outbox, {
        entityType: "account",
        entityId: id,
        baseRevision: current.server_revision,
        payload: next,
        base: () => accountSnapshot(current),
      });
      await ctx.database.runAsync(
        "UPDATE accounts SET interest_json = ?, sync_state = 'pending' WHERE id = ?",
        JSON.stringify({
          enabled: interest.enabled,
          annualRateBasisPoints: interest.enabled ? interest.annualRateBasisPoints : null,
          frequency: interest.enabled ? interest.frequency : null,
          payDay: interest.enabled ? interest.payDay : null,
        }),
        id,
      );
    });
  });
}
