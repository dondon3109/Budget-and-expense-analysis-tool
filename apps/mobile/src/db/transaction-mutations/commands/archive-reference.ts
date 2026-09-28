import type { z } from "zod";

import type { LocalCommandContext } from "../context";
import {
  LocalMutationError,
  accountSnapshot,
  categorySnapshot,
  syncEntityTable,
  type accountRowSchema,
  type categoryRowSchema,
} from "../model";
import { assertRowSettled, assertNoAttemptInFlight, queueDelete } from "./outbox-writes";

export function archiveReferenceEntity(
  ctx: LocalCommandContext,
  entityType: "account" | "category",
  id: string,
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current =
        entityType === "account"
          ? await ctx.store.currentAccount(id)
          : await ctx.store.currentCategory(id);
      if (current.system === 1) {
        throw new LocalMutationError(
          `Permanent ${entityType}s cannot be archived.`,
          "mutation_blocked",
        );
      }
      assertRowSettled(current.sync_state, entityType, "archiving");
      const outbox = await ctx.store.currentOutbox(entityType, id);
      assertNoAttemptInFlight(outbox, entityType, "archiving");
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.store.assertNoOutboxDependents(outbox.operation_id);
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync(`DELETE FROM ${syncEntityTable(entityType)} WHERE id = ?`, id);
        return;
      }
      await queueDelete(ctx, outbox, {
        entityType,
        entityId: id,
        baseRevision: current.server_revision,
        base: () =>
          entityType === "account"
            ? accountSnapshot(current as z.infer<typeof accountRowSchema>)
            : categorySnapshot(current as z.infer<typeof categoryRowSchema>),
      });
      await ctx.database.runAsync(
        `UPDATE ${syncEntityTable(entityType)} SET archived = 1, sync_state = 'pending' WHERE id = ?`,
        id,
      );
    });
  });
}
