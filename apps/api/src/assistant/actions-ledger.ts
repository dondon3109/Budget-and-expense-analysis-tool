import {
  matchCategory,
  type AssistantActionToolInput,
  type CategoryRecord,
  type Currency,
  type TransactionListItem,
} from "@zoption/shared";

import {
  isProposal,
  minor,
  missing,
  ready,
  reply,
  resolveTarget,
  type ActionProposal,
} from "./action-helpers";
import type { ActionRecords } from "./actions";
import { findAccountByName, formatMoney, normalizedName } from "./record-format";

const DEFAULT_CATEGORY_COLOR = "#64748b";

/** Names and ids stay short in the stored proposal; a long description is cut for the card. */
function label(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function editableCategories(records: ActionRecords): CategoryRecord[] {
  return records.categories.filter((item) => !item.archived && !item.locked);
}

export function proposeCategory(
  input: AssistantActionToolInput,
  records: ActionRecords,
): ActionProposal {
  const { action } = input;
  const active = editableCategories(records);
  if (action === "create_category") {
    if (!input.name) return missing(input, ["name"]);
    if (!input.categoryKind) return missing(input, ["categoryKind"]);
    if (
      records.categories.some((item) => normalizedName(item.name) === normalizedName(input.name!))
    ) {
      return {
        envelope: reply(input, {
          status: "invalid",
          reason: "A category with that name already exists.",
        }),
      };
    }
    return ready(input, {
      kind: "create_category",
      summary: `Add ${input.categoryKind} category ${input.name}`,
      input: { name: input.name, kind: input.categoryKind, color: DEFAULT_CATEGORY_COLOR },
    });
  }
  const target = resolveTarget(input, active);
  if (isProposal(target)) return target;
  if (target.system) {
    return {
      envelope: reply(input, {
        status: "invalid",
        reason: "Built-in categories cannot be changed.",
      }),
    };
  }
  const base = { targetId: target.id, targetName: target.name };
  if (action === "archive_category") {
    return ready(input, {
      kind: "archive_category",
      ...base,
      summary: `Archive category ${target.name}. Its past transactions keep it.`,
    });
  }
  // update_category: only a rename; color and icon stay in the app's own editor.
  if (!input.name) return missing(input, ["name"]);
  if (
    records.categories.some(
      (item) => item.id !== target.id && normalizedName(item.name) === normalizedName(input.name!),
    )
  ) {
    return {
      envelope: reply(input, {
        status: "invalid",
        reason: "A category with that name already exists.",
      }),
    };
  }
  return ready(input, {
    kind: "update_category",
    ...base,
    summary: `Rename category ${target.name} to ${input.name}`,
    input: { name: input.name },
  });
}

export function proposeBudget(
  input: AssistantActionToolInput,
  records: ActionRecords,
  currency: Currency,
): ActionProposal {
  const absent = [
    !input.categoryName && "categoryName",
    input.amount === undefined && "amount",
  ].filter((field): field is string => Boolean(field));
  if (absent.length > 0) return missing(input, absent);
  const expense = editableCategories(records).filter((item) => item.kind === "expense");
  const category =
    expense.find((item) => normalizedName(item.name) === normalizedName(input.categoryName!)) ??
    matchCategory(expense, input.categoryName, { kind: "expense" });
  if (!category) {
    return {
      envelope: reply(input, {
        status: "category_not_found",
        categoryName: input.categoryName,
        availableCategories: expense.map((item) => item.name),
      }),
    };
  }
  const month = `${(input.date ?? input.currentDate).slice(0, 7)}-01`;
  const limitMinor = minor(input.amount!);
  return ready(input, {
    kind: "set_budget",
    targetId: category.id,
    targetName: category.name,
    input: { month, limitMinor },
    summary:
      limitMinor === 0
        ? `Remove the ${category.name} budget for ${month.slice(0, 7)}`
        : `Set the ${category.name} budget for ${month.slice(0, 7)} to ${formatMoney(limitMinor, currency)}`,
  });
}

function describe(item: TransactionListItem): string {
  return `${item.description} on ${item.date} for ${formatMoney(Math.abs(item.amountMinor), item.currency)}`;
}

export function proposeTransaction(
  input: AssistantActionToolInput,
  records: ActionRecords,
): ActionProposal {
  if (!input.target) return missing(input, ["target"]);
  const wanted = input.matchAmount ? minor(input.matchAmount) : undefined;
  const matches = records.transactions.filter(
    (item) => wanted === undefined || Math.abs(item.amountMinor) === wanted,
  );
  if (matches.length !== 1) {
    return {
      envelope: reply(input, {
        status: matches.length === 0 ? "target_not_found" : "target_ambiguous",
        target: input.target,
        candidates: matches.slice(0, 5).map(describe),
        hint: "Ask for the date or amount of the one they mean (onDate, matchAmount).",
      }),
    };
  }
  const target = matches[0]!;
  const base = { targetId: target.id, targetName: label(target.description) };
  if (input.action === "delete_transaction") {
    return ready(input, {
      kind: "delete_transaction",
      ...base,
      summary: `Delete ${target.kind} ${describe(target)}`,
    });
  }
  if (target.kind === "transfer") {
    return {
      envelope: reply(input, {
        status: "invalid",
        reason: "Transfers cannot be edited here. Delete it and add a new one in the app.",
      }),
    };
  }
  const changes: Record<string, unknown> = {};
  const parts: string[] = [];
  if (input.name) {
    changes.description = input.name;
    parts.push(`description ${input.name}`);
  }
  if (input.amount !== undefined) {
    const amountMinor = minor(input.amount);
    if (amountMinor <= 0) {
      return { envelope: reply(input, { status: "invalid", reason: "Use an amount above zero." }) };
    }
    changes.amountMinor = amountMinor;
    parts.push(`amount ${formatMoney(amountMinor, target.currency)}`);
  }
  if (input.date) {
    changes.date = input.date;
    parts.push(`date ${input.date}`);
  }
  if (input.categoryName) {
    const pool = editableCategories(records).filter((item) => item.kind === target.kind);
    const category =
      pool.find((item) => normalizedName(item.name) === normalizedName(input.categoryName!)) ??
      matchCategory(pool, input.categoryName, { kind: target.kind });
    if (!category) {
      return {
        envelope: reply(input, {
          status: "category_not_found",
          categoryName: input.categoryName,
          availableCategories: pool.map((item) => item.name),
        }),
      };
    }
    changes.categoryId = category.id;
    parts.push(`category ${category.name}`);
  }
  if (input.accountName) {
    const accounts = records.accounts.filter((item) => !item.archived);
    const account = findAccountByName(accounts, input.accountName);
    if (!account) {
      return {
        envelope: reply(input, {
          status: "account_not_found",
          accountName: input.accountName,
          availableAccounts: accounts.map((item) => item.name),
        }),
      };
    }
    changes.accountId = account.id;
    parts.push(`account ${account.name}`);
  }
  if (parts.length === 0) return missing(input, ["a field to change"]);
  return ready(input, {
    kind: "update_transaction",
    ...base,
    summary: `Change ${describe(target)}: ${parts.join(", ")}`,
    input: changes,
  });
}
