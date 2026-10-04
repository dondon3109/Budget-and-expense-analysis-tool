import {
  matchCategory,
  type AccountRecord,
  type AssistantActionToolInput,
  type Currency,
  type CategoryRecord,
  type Debt,
  type FinancialGoal,
  type SubscriptionRecord,
  type TransactionListItem,
} from "@zoption/shared";

import type { AccountRepository } from "../db/accounts";
import type { CategoryRepository } from "../db/categories";
import type { DebtRepository } from "../db/debts";
import type { FinancialGoalRepository } from "../db/goals";
import type { SubscriptionRepository } from "../db/subscriptions";
import type { TransactionRepository } from "../db/transactions";
import type { Bindings } from "../types";
import {
  invalid,
  isProposal,
  minor,
  missing,
  ready,
  reply,
  resolveTarget,
  sourceFor,
  type ActionProposal,
} from "./action-helpers";
import { proposeBudget, proposeCategory, proposeTransaction } from "./actions-ledger";
import { findAccountByName, formatMoney, normalizedName } from "./record-format";

/** The tenant's records a proposal is resolved against. Only the kinds an action needs are loaded. */
export type { ActionProposal };

export interface ActionRecords {
  accounts: readonly AccountRecord[];
  categories: readonly CategoryRecord[];
  goals: readonly FinancialGoal[];
  debts: readonly Debt[];
  subscriptions: readonly SubscriptionRecord[];
  /** Candidates for a transaction target, already narrowed by the search the request named. */
  transactions: readonly TransactionListItem[];
}

/** What the account holds in its own currency, as the account list and Adjust balance show it. */
export function accountBalanceMinor(account: AccountRecord): number {
  return account.balancesByCurrency?.[account.currency] ?? account.balanceMinor ?? 0;
}

function resolveCategoryAndAccount(
  input: AssistantActionToolInput,
  records: ActionRecords,
): { category: CategoryRecord; account: AccountRecord } | ActionProposal {
  const names: string[] = [];
  if (!input.categoryName) names.push("categoryName");
  if (!input.accountName) names.push("accountName");
  if (names.length > 0) return missing(input, names);
  const categories = records.categories.filter(
    (item) => !item.archived && !item.locked && item.kind === "expense",
  );
  const category =
    categories.find((item) => normalizedName(item.name) === normalizedName(input.categoryName!)) ??
    matchCategory(categories, input.categoryName, { kind: "expense" });
  if (!category) {
    return {
      envelope: reply(input, {
        status: "category_not_found",
        categoryName: input.categoryName,
        availableCategories: categories.map((item) => item.name),
      }),
    };
  }
  const accounts = records.accounts.filter((item) => !item.archived);
  const account = findAccountByName(accounts, input.accountName!);
  if (!account) {
    return {
      envelope: reply(input, {
        status: "account_not_found",
        accountName: input.accountName,
        availableAccounts: accounts.map((item) => item.name),
      }),
    };
  }
  return { category, account };
}

function proposeSubscription(
  input: AssistantActionToolInput,
  records: ActionRecords,
): ActionProposal {
  const { action } = input;
  if (action === "create_subscription") {
    const absent = (
      [
        ["name", input.name],
        ["amount", input.amount],
        ["billingCycle", input.billingCycle],
        ["date", input.date],
      ] as const
    )
      .filter(([, value]) => value === undefined)
      .map(([field]) => field);
    if (absent.length > 0) return missing(input, absent);
    const resolved = resolveCategoryAndAccount(input, records);
    if (isProposal(resolved)) return resolved;
    const { category, account } = resolved;
    const amountMinor = minor(input.amount!);
    return ready(input, {
      kind: "create_subscription",
      summary: `Add subscription ${input.name}: ${formatMoney(amountMinor, account.currency)} ${input.billingCycle}, next bill ${input.date}, ${category.name}, paid from ${account.name}`,
      input: {
        name: input.name!,
        amountMinor,
        currency: account.currency,
        billingCycle: input.billingCycle!,
        nextBillingDate: input.date!,
        categoryId: category.id,
        accountId: account.id,
      },
    });
  }
  const target = resolveTarget(input, records.subscriptions);
  if (isProposal(target)) return target;
  const base = { targetId: target.id, targetName: target.name };
  if (action === "delete_subscription") {
    return ready(input, {
      kind: "delete_subscription",
      ...base,
      summary: `Delete subscription ${target.name}. Its past charges stay in your transactions.`,
    });
  }
  if (action === "set_subscription_status") {
    if (input.status !== "active" && input.status !== "canceled") return missing(input, ["status"]);
    return ready(input, {
      kind: "set_subscription_status",
      ...base,
      input: { status: input.status },
      summary: `${input.status === "canceled" ? "Cancel" : "Reactivate"} subscription ${target.name}`,
    });
  }
  // update_subscription: the stored input is the whole record, so unchanged fields carry over.
  const changed = [
    input.name,
    input.amount,
    input.billingCycle,
    input.date,
    input.categoryName,
    input.accountName,
  ];
  if (changed.every((value) => value === undefined)) return missing(input, ["a field to change"]);
  let categoryId = target.categoryId;
  let accountId = target.accountId;
  let categoryName = target.categoryName;
  let accountName = target.accountName;
  if (input.categoryName || input.accountName) {
    const resolved = resolveCategoryAndAccount(
      {
        ...input,
        categoryName: input.categoryName ?? target.categoryName,
        accountName: input.accountName ?? target.accountName ?? undefined,
      },
      records,
    );
    if (isProposal(resolved)) return resolved;
    categoryId = resolved.category.id;
    accountId = resolved.account.id;
    categoryName = resolved.category.name;
    accountName = resolved.account.name;
  }
  if (!accountId) return missing(input, ["accountName"]);
  const amountMinor = input.amount ? minor(input.amount) : target.amountMinor;
  const parts = [
    input.name && `name ${input.name}`,
    input.amount && `amount ${formatMoney(amountMinor, target.currency)}`,
    input.billingCycle && `billed ${input.billingCycle}`,
    input.date && `next bill ${input.date}`,
    input.categoryName && `category ${categoryName}`,
    input.accountName && `paid from ${accountName}`,
  ].filter(Boolean);
  return ready(input, {
    kind: "update_subscription",
    ...base,
    summary: `Change subscription ${target.name}: ${parts.join(", ")}`,
    input: {
      name: input.name ?? target.name,
      amountMinor,
      currency: target.currency,
      billingCycle: input.billingCycle ?? target.billingCycle,
      nextBillingDate: input.date ?? target.nextBillingDate,
      categoryId,
      accountId,
    },
  });
}

function proposeGoal(
  input: AssistantActionToolInput,
  records: ActionRecords,
  currency: Currency,
): ActionProposal {
  const { action } = input;
  if (action === "create_goal") {
    const absent = (
      [
        ["name", input.name],
        ["amount", input.amount],
        ["date", input.date],
      ] as const
    )
      .filter(([, value]) => value === undefined)
      .map(([field]) => field);
    if (absent.length > 0) return missing(input, absent);
    const targetAmountMinor = minor(input.amount!);
    const currentAmountMinor = input.currentAmount ? minor(input.currentAmount) : 0;
    return ready(input, {
      kind: "create_goal",
      summary: `Add savings goal ${input.name}: target ${formatMoney(targetAmountMinor, currency)} by ${input.date}, ${formatMoney(currentAmountMinor, currency)} saved so far`,
      input: {
        name: input.name!,
        targetAmountMinor,
        currentAmountMinor,
        targetDate: input.date!,
        status: "active",
      },
    });
  }
  const target = resolveTarget(input, records.goals);
  if (isProposal(target)) return target;
  const base = { targetId: target.id, targetName: target.name };
  if (action === "delete_goal") {
    return ready(input, {
      kind: "delete_goal",
      ...base,
      summary: `Delete savings goal ${target.name}`,
    });
  }
  const goalStatus =
    input.status === "active" || input.status === "paused" || input.status === "completed"
      ? input.status
      : undefined;
  if (input.status && !goalStatus)
    return invalid(input, "A goal can be active, paused, or completed.");
  const changes = {
    ...(input.name ? { name: input.name } : {}),
    ...(input.amount ? { targetAmountMinor: minor(input.amount) } : {}),
    ...(input.currentAmount ? { currentAmountMinor: minor(input.currentAmount) } : {}),
    ...(input.date ? { targetDate: input.date } : {}),
    ...(goalStatus ? { status: goalStatus } : {}),
  };
  if (Object.keys(changes).length === 0) return missing(input, ["a field to change"]);
  if (
    (changes.currentAmountMinor ?? target.currentAmountMinor) >
    (changes.targetAmountMinor ?? target.targetAmountMinor)
  ) {
    return invalid(input, "Current savings cannot exceed the target amount.");
  }
  const parts = [
    changes.name && `name ${changes.name}`,
    changes.targetAmountMinor !== undefined &&
      `target ${formatMoney(changes.targetAmountMinor, currency)}`,
    changes.currentAmountMinor !== undefined &&
      `saved ${formatMoney(changes.currentAmountMinor, currency)}`,
    changes.targetDate && `target date ${changes.targetDate}`,
    changes.status && `status ${changes.status}`,
  ].filter(Boolean);
  return ready(input, {
    kind: "update_goal",
    ...base,
    summary: `Change savings goal ${target.name}: ${parts.join(", ")}`,
    input: changes,
  });
}

function proposeDebt(
  input: AssistantActionToolInput,
  records: ActionRecords,
  currency: Currency,
): ActionProposal {
  const { action } = input;
  const money = (value: number) => formatMoney(value, currency);
  if (action === "create_debt") {
    const absent = (
      [
        ["name", input.name],
        ["debtType", input.debtType],
        ["amount", input.amount],
        ["apr", input.apr],
        ["minimumPayment", input.minimumPayment],
      ] as const
    )
      .filter(([, value]) => value === undefined)
      .map(([field]) => field);
    if (absent.length > 0) return missing(input, absent);
    const balanceMinor = minor(input.amount!);
    const minimumPaymentMinor = minor(input.minimumPayment!);
    return ready(input, {
      kind: "create_debt",
      summary: `Add debt ${input.name} (${input.debtType!.replace("_", " ")}): balance ${money(balanceMinor)}, ${input.apr}% APR, minimum payment ${money(minimumPaymentMinor)}`,
      input: {
        name: input.name!,
        type: input.debtType!,
        balanceMinor,
        aprBasisPoints: minor(input.apr!),
        minimumPaymentMinor,
        balanceAsOf: input.date ?? input.currentDate,
        status: "active",
      },
    });
  }
  const target = resolveTarget(input, records.debts);
  if (isProposal(target)) return target;
  const base = { targetId: target.id, targetName: target.name };
  if (action === "delete_debt") {
    return ready(input, { kind: "delete_debt", ...base, summary: `Delete debt ${target.name}` });
  }
  const debtStatus =
    input.status === "active" || input.status === "paid" ? input.status : undefined;
  if (input.status && !debtStatus) return invalid(input, "A debt can be active or paid.");
  const changes = {
    ...(input.name ? { name: input.name } : {}),
    ...(input.debtType ? { type: input.debtType } : {}),
    ...(input.amount
      ? { balanceMinor: minor(input.amount), balanceAsOf: input.date ?? input.currentDate }
      : {}),
    ...(input.apr ? { aprBasisPoints: minor(input.apr) } : {}),
    ...(input.minimumPayment ? { minimumPaymentMinor: minor(input.minimumPayment) } : {}),
    ...(debtStatus ? { status: debtStatus } : {}),
  };
  if (Object.keys(changes).length === 0) return missing(input, ["a field to change"]);
  const parts = [
    changes.name && `name ${changes.name}`,
    changes.type && `type ${changes.type.replace("_", " ")}`,
    changes.balanceMinor !== undefined && `balance ${money(changes.balanceMinor)}`,
    changes.aprBasisPoints !== undefined && `${input.apr}% APR`,
    changes.minimumPaymentMinor !== undefined &&
      `minimum payment ${money(changes.minimumPaymentMinor)}`,
    changes.status && `status ${changes.status}`,
  ].filter(Boolean);
  return ready(input, {
    kind: "update_debt",
    ...base,
    summary: `Change debt ${target.name}: ${parts.join(", ")}`,
    input: changes,
  });
}

function proposeAccount(
  input: AssistantActionToolInput,
  records: ActionRecords,
  workspaceCurrency: Currency,
): ActionProposal {
  const { action } = input;
  const active = records.accounts.filter((item) => !item.archived);
  if (action === "create_account") {
    const absent = (
      [
        ["name", input.name],
        ["accountType", input.accountType],
      ] as const
    )
      .filter(([, value]) => value === undefined)
      .map(([field]) => field);
    if (absent.length > 0) return missing(input, absent);
    if (active.some((item) => normalizedName(item.name) === normalizedName(input.name!))) {
      return invalid(input, "An account with that name already exists.");
    }
    const currency = input.currency ?? workspaceCurrency;
    return ready(input, {
      kind: "create_account",
      summary: `Add account ${input.name} (${input.accountType}) in ${currency}. Its balance starts at zero; set it afterwards by adjusting the balance.`,
      input: {
        name: input.name!,
        type: input.accountType!,
        ...(input.currency ? { currency: input.currency } : {}),
      },
    });
  }
  const target = resolveTarget(input, active);
  if (isProposal(target)) return target;
  const base = { targetId: target.id, targetName: target.name };
  if (action === "archive_account") {
    if (target.system) return invalid(input, "Permanent accounts cannot be removed.");
    return ready(input, {
      kind: "archive_account",
      ...base,
      summary: `Archive account ${target.name}. Its past transactions stay in your records.`,
    });
  }
  if (action === "adjust_balance") {
    if (input.amount === undefined) return missing(input, ["amount"]);
    const newBalanceMinor = minor(input.amount);
    const current = accountBalanceMinor(target);
    if (newBalanceMinor === current) {
      return {
        envelope: reply(input, {
          status: "already_matches",
          balance: formatMoney(current, target.currency),
        }),
      };
    }
    const delta = Math.abs(newBalanceMinor - current);
    return ready(input, {
      kind: "adjust_balance",
      ...base,
      input: { newBalanceMinor },
      summary: `Set ${target.name} balance from ${formatMoney(current, target.currency)} to ${formatMoney(newBalanceMinor, target.currency)}. This records a ${formatMoney(delta, target.currency)} ${newBalanceMinor > current ? "income" : "expense"} balance adjustment dated today.`,
    });
  }
  // update_account
  if (input.name === undefined && input.accountType === undefined) {
    return missing(input, ["a field to change"]);
  }
  if (
    input.name &&
    active.some(
      (item) => item.id !== target.id && normalizedName(item.name) === normalizedName(input.name!),
    )
  ) {
    return invalid(input, "An account with that name already exists.");
  }
  const parts = [
    input.name && `name ${input.name}`,
    input.accountType && `type ${input.accountType}`,
  ].filter(Boolean);
  return ready(input, {
    kind: "update_account",
    ...base,
    summary: `Change account ${target.name}: ${parts.join(", ")}`,
    input: { name: input.name ?? target.name, type: input.accountType ?? target.type },
  });
}

/**
 * Resolves what the model asked for against the tenant's own records and builds the proposal.
 * It never writes: the proposal waits in the reply until the user confirms it.
 */
export function proposeAction(
  input: AssistantActionToolInput,
  records: ActionRecords,
  workspaceCurrency: Currency,
): ActionProposal {
  const source = sourceFor(input.action);
  if (source === "subscriptions") return proposeSubscription(input, records);
  if (source === "accounts") return proposeAccount(input, records, workspaceCurrency);
  if (source === "categories") return proposeCategory(input, records);
  if (source === "budgets") return proposeBudget(input, records, workspaceCurrency);
  if (source === "transactions") return proposeTransaction(input, records);
  if (source === "goals") return proposeGoal(input, records, workspaceCurrency);
  return proposeDebt(input, records, workspaceCurrency);
}

export interface ActionStores {
  accounts: AccountRepository;
  categories: CategoryRepository;
  goals: FinancialGoalRepository;
  debts: DebtRepository;
  subscriptions: SubscriptionRepository;
  transactions: Pick<TransactionRepository, "list">;
}

/** Loads only the records the action's kind needs, then resolves the proposal against them. */
export async function loadAndProposeAction(
  stores: ActionStores,
  context: { env: Bindings; tenantId: string },
  input: AssistantActionToolInput,
  loadCurrency: (env: Bindings, tenantId: string) => Promise<Currency>,
): Promise<ActionProposal> {
  const { env, tenantId } = context;
  const source = sourceFor(input.action);
  const subscription = source === "subscriptions";
  const transaction = source === "transactions";
  const [currency, accounts, categories, goals, debts, month, page] = await Promise.all([
    loadCurrency(env, tenantId),
    subscription || transaction || source === "accounts" ? stores.accounts.list(env, tenantId) : [],
    subscription || transaction || source === "categories" || source === "budgets"
      ? stores.categories.list(env, tenantId)
      : [],
    source === "goals" ? stores.goals.list(env, tenantId) : [],
    source === "debts" ? stores.debts.list(env, tenantId) : [],
    subscription
      ? stores.subscriptions.list(env, tenantId, `${input.currentDate.slice(0, 7)}-01`)
      : undefined,
    transaction && input.target
      ? stores.transactions.list(env, tenantId, {
          search: input.target,
          from: input.onDate,
          to: input.onDate,
          sortBy: "date",
          sortDirection: "desc",
          page: 1,
          pageSize: 50,
        })
      : undefined,
  ]);
  return proposeAction(
    input,
    {
      accounts,
      categories,
      goals,
      debts,
      subscriptions: month?.items ?? [],
      transactions: page?.items ?? [],
    },
    currency,
  );
}
