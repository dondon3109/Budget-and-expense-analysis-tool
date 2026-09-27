import {
  accountInputSchema,
  accountUpdateWithInterestSchema,
  interestUpdateSchema,
  mobileSyncAccountUpdateSchema,
  type AccountInput,
  type AccountInterestUpdate,
  type AccountUpdateWithInterest,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, accountSnapshot, uuidSchema } from "../model";

export function createAccount(ctx: LocalCommandContext, value: AccountInput): Promise<string> {
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
        ) VALUES (?, ?, ?, 'PHP', 0, 0, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.type,
        JSON.stringify({
          enabled: false,
          annualRateBasisPoints: null,
          frequency: null,
          payDay: null,
        }),
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'account', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify(input),
        await ctx.store.nextSequence(),
      );
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
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this account's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      if (current.system === 1 && update.name !== current.name) {
        throw new LocalMutationError("Permanent accounts cannot be renamed.", "mutation_blocked");
      }
      await ctx.store.assertUniqueName("account", update.name, id);
      const outbox = await ctx.store.currentOutbox("account", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This account is already waiting to be archived.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this account.",
          "mutation_blocked",
        );
      }
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
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(next),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'account', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(next),
          JSON.stringify(accountSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
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
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this account's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      if (current.type !== "savings") {
        throw new LocalMutationError("Only savings accounts earn interest.", "mutation_blocked");
      }
      const outbox = await ctx.store.currentOutbox("account", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This account is already waiting to be archived.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this account.",
          "mutation_blocked",
        );
      }
      const next = outbox
        ? {
            ...mobileSyncAccountUpdateSchema.parse(JSON.parse(outbox.payload_json) as unknown),
            interest,
          }
        : { name: current.name, type: current.type, interest };
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(next),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'account', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(next),
          JSON.stringify(accountSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
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
