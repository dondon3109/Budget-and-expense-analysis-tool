import {
  assistantActionSchema,
  type AssistantAction,
  type AssistantMessage,
} from "@zoption/shared";

import type { AssistantActionRepository } from "../db/assistant-actions";
import type { DebtRepository } from "../db/debts";
import type { FinancialGoalRepository } from "../db/goals";
import type { SubscriptionRepository } from "../db/subscriptions";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface AssistantActionDependencies {
  actions: AssistantActionRepository;
  subscriptions: Pick<SubscriptionRepository, "create" | "update" | "setStatus" | "remove">;
  goals: Pick<FinancialGoalRepository, "create" | "update" | "remove">;
  debts: Pick<DebtRepository, "create" | "update" | "remove">;
}

/** Runs the stored proposal through the repository the app's own forms use. */
async function apply(
  deps: AssistantActionDependencies,
  env: Bindings,
  tenantId: string,
  action: AssistantAction,
): Promise<void> {
  switch (action.kind) {
    case "create_subscription":
      await deps.subscriptions.create(env, tenantId, action.input);
      return;
    case "update_subscription":
      await deps.subscriptions.update(env, tenantId, action.targetId, action.input);
      return;
    case "set_subscription_status":
      await deps.subscriptions.setStatus(env, tenantId, action.targetId, action.input);
      return;
    case "delete_subscription":
      await deps.subscriptions.remove(env, tenantId, action.targetId);
      return;
    case "create_goal":
      await deps.goals.create(env, tenantId, action.input);
      return;
    case "update_goal":
      await deps.goals.update(env, tenantId, action.targetId, action.input);
      return;
    case "delete_goal":
      await deps.goals.remove(env, tenantId, action.targetId);
      return;
    case "create_debt":
      await deps.debts.create(env, tenantId, action.input);
      return;
    case "update_debt":
      await deps.debts.update(env, tenantId, action.targetId, action.input);
      return;
    case "delete_debt":
      await deps.debts.remove(env, tenantId, action.targetId);
      return;
  }
}

/**
 * Applies the change an assistant reply proposed, at most once. The body of the request is
 * empty on purpose: the server applies its own stored proposal, never client-supplied fields.
 */
export async function confirmAssistantAction(
  deps: AssistantActionDependencies,
  env: Bindings,
  tenantId: string,
  messageId: string,
): Promise<AssistantMessage> {
  const { actions } = deps;
  const message = await actions.findMessage(env, tenantId, messageId);
  const parsed = assistantActionSchema.safeParse(message?.metadata?.assistantAction);
  if (!message || !parsed.success) {
    throw new HttpError(404, "assistant_action_not_found", "That proposed change was not found.");
  }
  // Confirming again returns the finished reply, so a retried tap never applies it twice.
  if (parsed.data.status === "done") return message;
  if (await actions.isSuperseded(env, tenantId, message)) {
    throw new HttpError(
      409,
      "assistant_action_superseded",
      "A newer proposal replaced this one. Confirm the latest one instead.",
    );
  }
  const claimedAt = await actions.claim(env, tenantId, messageId);
  if (!claimedAt) {
    const current = await actions.findMessage(env, tenantId, messageId);
    if (current?.metadata?.assistantAction?.status === "done") return current;
    throw new HttpError(
      409,
      "assistant_action_in_progress",
      "This change is already being applied. If it does not finish, check your lists before asking again.",
    );
  }
  try {
    await apply(deps, env, tenantId, parsed.data);
  } catch (error) {
    await actions.release(env, tenantId, messageId, claimedAt);
    throw error;
  }
  const done = await actions.markDone(env, tenantId, messageId, claimedAt);
  return (
    done ?? {
      ...message,
      metadata: { ...message.metadata!, assistantAction: { ...parsed.data, status: "done" } },
    }
  );
}
