import {
  assistantActionSchema,
  parseAmountToMinor,
  type AssistantAction,
  type AssistantActionToolInput,
  type AssistantToolResultEnvelope,
} from "@zoption/shared";

import { normalizedName } from "./record-format";

export interface ActionProposal {
  envelope: AssistantToolResultEnvelope<unknown>;
  /** Kept out of the envelope, so its record ids never reach the model or the audit trail. */
  action?: AssistantAction;
}

export type SourceType =
  "subscriptions" | "goals" | "debts" | "accounts" | "categories" | "budgets" | "transactions";

export function sourceFor(kind: AssistantActionToolInput["action"]): SourceType {
  if (kind.endsWith("category")) return "categories";
  if (kind === "set_budget") return "budgets";
  if (kind.endsWith("transaction")) return "transactions";
  if (kind.endsWith("subscription") || kind === "set_subscription_status") return "subscriptions";
  if (kind.endsWith("goal")) return "goals";
  if (kind.endsWith("debt")) return "debts";
  return "accounts";
}

export function reply(
  input: AssistantActionToolInput,
  data: Record<string, unknown>,
): AssistantToolResultEnvelope<unknown> {
  return {
    data,
    source: { sourceType: sourceFor(input.action) },
    dataQuality: { status: "reliable", signals: [] },
  };
}

export function missing(input: AssistantActionToolInput, fields: string[]): ActionProposal {
  return { envelope: reply(input, { status: "missing_details", missing: fields }) };
}

export function invalid(input: AssistantActionToolInput, reason: string): ActionProposal {
  return { envelope: reply(input, { status: "invalid", reason }) };
}

/** An exact name wins; otherwise a single partial match does, so "netflix" finds "Netflix Premium". */
export function findByName<T extends { name: string }>(
  items: readonly T[],
  name: string,
): T | "many" | undefined {
  const wanted = normalizedName(name);
  const exact = items.filter((item) => normalizedName(item.name) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return "many";
  const partial = items.filter((item) => normalizedName(item.name).includes(wanted));
  if (partial.length === 1) return partial[0];
  return partial.length > 1 ? "many" : undefined;
}

export function resolveTarget<T extends { id: string; name: string }>(
  input: AssistantActionToolInput,
  items: readonly T[],
): T | ActionProposal {
  if (!input.target) return missing(input, ["target"]);
  const found = findByName(items, input.target);
  if (found && found !== "many") return found;
  return {
    envelope: reply(input, {
      status: found === "many" ? "target_ambiguous" : "target_not_found",
      target: input.target,
      available: items.map((item) => item.name),
    }),
  };
}

export function isProposal(value: object): value is ActionProposal {
  return "envelope" in value;
}

export function ready(
  input: AssistantActionToolInput,
  action: Record<string, unknown>,
): ActionProposal {
  const parsed = assistantActionSchema.safeParse({ ...action, status: "pending" });
  if (!parsed.success) {
    return invalid(input, parsed.error.issues[0]?.message ?? "The details are not valid.");
  }
  const destructive = parsed.data.kind.startsWith("delete_");
  return {
    action: parsed.data,
    envelope: reply(input, {
      status: "ready",
      applied: false,
      summary: parsed.data.summary,
      nextStep: `Not applied yet. Ask the user to review the card and tap ${destructive ? "Delete" : "Confirm"}.`,
    }),
  };
}

export function minor(value: string): number {
  return parseAmountToMinor(value);
}
