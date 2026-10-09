import {
  assistantActionSchema,
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  resolveAdjustmentCategoryId,
  type AssistantAction,
  type AssistantMessage,
} from "@zoption/shared";

import type { AccountRepository } from "../db/accounts";
import type { BudgetRepository } from "../db/budgets";
import type { AssistantActionRepository } from "../db/assistant-actions";
import type { CategoryRepository } from "../db/categories";
import type { DebtRepository } from "../db/debts";
import type { FinancialGoalRepository } from "../db/goals";
import type { SubscriptionRepository } from "../db/subscriptions";
import type { TransactionRepository } from "../db/transactions";
import { HttpError } from "../errors";
import { accountBalanceMinor } from "./actions";
import type { Bindings } from "../types";

export interface AssistantActionDependencies {
  actions: AssistantActionRepository;
  subscriptions: Pick<SubscriptionRepository, "create" | "update" | "setStatus" | "remove">;
  goals: Pick<FinancialGoalRepository, "create" | "update" | "remove">;
  debts: Pick<DebtRepository, "create" | "update" | "remove">;
  accounts: Required<Pick<AccountRepository, "list" | "create" | "update" | "remove">>;
  categories: Pick<CategoryRepository, "list" | "create" | "update">;
  budgets: Pick<BudgetRepository, "upsert">;
  transactions: Pick<TransactionRepository, "create" | "update" | "remove">;
}

/** The user's calendar day, so an early-morning adjustment is not booked on yesterday. */
function todayInTimeZone(env: Bindings): string {
  const timeZone = env.ASSISTANT_TIME_ZONE?.trim() || "Asia/Manila";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/**
 * Books the adjustment Adjust balance would, against the balance the account holds now. The
 * row is keyed on the reply's id, and an account that already holds the balance needs none.
 */
async function adjustBalance(
  deps: AssistantActionDependencies,
  env: Bindings,
  tenantId: string,
  messageId: string,
  accountId: string,
  newBalanceMinor: number,
): Promise<void> {
  const [accounts, categories] = await Promise.all([
    deps.accounts.list(env, tenantId),
    deps.categories.list(env, tenantId),
  ]);
  const account = accounts.find((item) => item.id === accountId && !item.archived);
  if (!account) throw new HttpError(404, "account_not_found", "The account was not found.");
  const currentBalanceMinor = accountBalanceMinor(account);
  const { kind } = computeBalanceAdjustment(currentBalanceMinor, newBalanceMinor);
  if (kind === null) return;
  const categoryId = resolveAdjustmentCategoryId(categories, kind);
  if (!categoryId) {
    throw new HttpError(
      409,
      "adjustment_category_missing",
      "No category is available to book this adjustment.",
    );
  }
  const input = buildBalanceAdjustmentInput({
    accountId,
    accountName: account.name,
    categoryId,
    currency: account.currency,
    currentBalanceMinor,
    newBalanceMinor,
    date: todayInTimeZone(env),
  });
  if (input) await deps.transactions.create(env, tenantId, input, { id: messageId });
}

/** Runs the stored proposal through the repository the app's own forms use. */
async function apply(
  deps: AssistantActionDependencies,
  env: Bindings,
  tenantId: string,
  messageId: string,
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
    case "create_account":
      await deps.accounts.create(env, tenantId, action.input);
      return;
    case "update_account":
      await deps.accounts.update(env, tenantId, action.targetId, action.input);
      return;
    case "archive_account":
      await deps.accounts.remove(env, tenantId, action.targetId);
      return;
    case "adjust_balance":
      await adjustBalance(
        deps,
        env,
        tenantId,
        messageId,
        action.targetId,
        action.input.newBalanceMinor,
      );
      return;
    case "create_category":
      await deps.categories.create(env, tenantId, action.input);
      return;
    case "update_category":
      await deps.categories.update(env, tenantId, action.targetId, action.input);
      return;
    case "archive_category":
      await deps.categories.update(env, tenantId, action.targetId, { archived: true });
      return;
    case "set_budget":
      await deps.budgets.upsert(env, tenantId, {
        scope: "month",
        month: action.input.month,
        items: [{ categoryId: action.targetId, limitMinor: action.input.limitMinor }],
      });
      return;
    case "update_transaction":
      await deps.transactions.update(env, tenantId, action.targetId, action.input);
      return;
    case "delete_transaction":
      await deps.transactions.remove(env, tenantId, action.targetId);
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
    await apply(deps, env, tenantId, messageId, parsed.data);
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
