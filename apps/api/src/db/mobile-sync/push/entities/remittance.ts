import type { MobileSyncPushOperation } from "@zoption/shared";

import type { Bindings } from "../../../../types";
import { appliedOperationGuard } from "../idempotency";
import type { EntityMutation } from "../results";

type RemittanceOperation = Extract<MobileSyncPushOperation, { entityType: "remittance" }>;
type Arrival = Extract<RemittanceOperation, { operationType: "update" }>["payload"];

export function arrivalDescription(provider: string | null | undefined): string {
  return provider ? `Remittance via ${provider}` : "Remittance";
}

/**
 * The income transaction a remittance becomes once it arrives, under the client's id. It runs
 * after the operation's idempotency row, so it lands only when the remittance write did.
 */
function arrivalInsert(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: RemittanceOperation,
  userId: string,
  provider: string | null | undefined,
  arrival: Arrival,
  timestamp: string,
): D1PreparedStatement {
  const guard = appliedOperationGuard(tenantId, clientId, operation);
  return env.DB.prepare(
    `INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind,
      source_kind, created_by_user_id, revision, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT currency FROM tenants WHERE id = ?), 'PHP'),
      'income', 'manual', ?, 1, ?
    WHERE ${guard.condition}`,
  ).bind(
    arrival.transactionId,
    tenantId,
    arrival.accountId,
    arrival.categoryId,
    arrival.date,
    arrivalDescription(provider),
    arrival.amountMinor,
    tenantId,
    userId,
    timestamp,
    ...guard.bindings,
  );
}

/**
 * A create records a send (and its arrival when the client already knows it), an update
 * confirms the arrival, and a delete cancels a send that never arrived. `provider` is the stored
 * send's, which names the arrival on an update.
 */
export function remittanceMutation(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: RemittanceOperation,
  userId: string,
  provider: string | null,
  timestamp: string,
): EntityMutation {
  if (operation.operationType === "create") {
    const send = operation.payload;
    const received = send.received;
    const mutation = env.DB.prepare(
      `INSERT INTO family_remittances (id, tenant_id, sent_by_user_id, sent_amount_minor,
         sent_currency, fee_minor, provider, sent_on, note, transaction_id, received_by_user_id,
         received_at, revision, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      operation.entityId,
      tenantId,
      userId,
      send.sentAmountMinor,
      send.sentCurrency,
      send.feeMinor ?? 0,
      send.provider || null,
      send.sentOn,
      send.note || null,
      received?.transactionId ?? null,
      received ? userId : null,
      received ? timestamp : null,
      timestamp,
    );
    const extraStatements = received
      ? [
          arrivalInsert(
            env,
            tenantId,
            clientId,
            operation,
            userId,
            send.provider,
            received,
            timestamp,
          ),
        ]
      : [];
    return { mutation, extraStatements };
  }
  if (operation.operationType === "update") {
    // The update trigger bumps the revision to the acknowledged one and logs the change.
    const mutation = env.DB.prepare(
      `UPDATE family_remittances
       SET transaction_id = ?, received_by_user_id = ?, received_at = ?
       WHERE tenant_id = ? AND id = ? AND revision = ? AND received_at IS NULL`,
    ).bind(
      operation.payload.transactionId,
      userId,
      timestamp,
      tenantId,
      operation.entityId,
      operation.baseRevision,
    );
    return {
      mutation,
      extraStatements: [
        arrivalInsert(
          env,
          tenantId,
          clientId,
          operation,
          userId,
          provider,
          operation.payload,
          timestamp,
        ),
      ],
    };
  }
  const mutation = env.DB.prepare(
    `DELETE FROM family_remittances
     WHERE tenant_id = ? AND id = ? AND revision = ? AND received_at IS NULL`,
  ).bind(tenantId, operation.entityId, operation.baseRevision);
  return { mutation, extraStatements: [] };
}
