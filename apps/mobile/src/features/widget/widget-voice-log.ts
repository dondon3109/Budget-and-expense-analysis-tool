import {
  matchCategory,
  preferredTransactionAccount,
  transactionInputSchema,
  type TransactionInput,
  type TransactionVoiceDraft,
} from "@zoption/shared";

import { ApiTransportError } from "@/api/authenticated";
import type { LocalAccountOption, LocalCategoryOption } from "@/db/view-models";

import { resolveWidgetAccountFromTranscript, resolveWidgetCategory } from "./widget-intent";

// The widget's background path: a spoken note goes to the AI entry service, and
// every income or expense it names is saved locally (mutation plus outbox row,
// in one SQLite transaction) without the app opening. Nothing here touches the
// UI, so each failure maps to a reason the notification can explain.

export type WidgetLogFailure =
  | "signed_out"
  | "workspace_unavailable"
  | "no_account"
  | "consent_required"
  | "limit_reached"
  | "unreadable"
  | "unavailable";

export type WidgetLogResult =
  { status: "logged"; count: number } | { status: "failed"; reason: WidgetLogFailure };

export interface WidgetLogWorkspace {
  readFormData(): Promise<{ accounts: LocalAccountOption[]; categories: LocalCategoryOption[] }>;
  createTransactions(inputs: TransactionInput[]): Promise<unknown>;
}

export interface WidgetLogDeps {
  getSession(): Promise<{ accessToken: string; subject: string } | null>;
  openWorkspace(subject: string): Promise<WidgetLogWorkspace>;
  defaultAccountId(): Promise<string | null>;
  extract(
    accessToken: string,
    transcript: string,
    categoryNames: string[],
  ): Promise<TransactionVoiceDraft[]>;
}

/**
 * Turns AI drafts into transaction inputs. The speaker's named account (or the
 * device's default) applies to the whole note, and the draft amounts are pesos,
 * so only PHP accounts qualify. Returns null when no account can take them.
 */
export function buildWidgetTransactionInputs({
  drafts,
  transcript,
  accounts,
  categories,
  defaultAccountId,
}: {
  drafts: readonly TransactionVoiceDraft[];
  transcript: string;
  accounts: readonly LocalAccountOption[];
  categories: readonly LocalCategoryOption[];
  defaultAccountId: string | null;
}): TransactionInput[] | null {
  const phpAccounts = accounts.filter((account) => account.currency === "PHP" && !account.pending);
  const accountId =
    resolveWidgetAccountFromTranscript(phpAccounts, transcript) ??
    preferredTransactionAccount(phpAccounts, defaultAccountId)?.id;
  if (!accountId) return null;

  const inputs: TransactionInput[] = [];
  for (const draft of drafts) {
    if (draft.kind === "transfer") continue;
    const kindCategories = categories.filter(
      (category) => category.kind === draft.kind && !category.pending,
    );
    const categoryId =
      matchCategory(kindCategories, draft.categoryName, {
        kind: draft.kind,
        contextText: draft.description,
      })?.id ?? resolveWidgetCategory(kindCategories, draft.kind);
    if (!categoryId) return null;
    const parsed = transactionInputSchema.safeParse({
      kind: draft.kind,
      accountId,
      categoryId,
      date: draft.date,
      description: draft.description,
      amountMinor: draft.amountMinor,
      currency: "PHP",
    });
    if (!parsed.success) return null;
    inputs.push(parsed.data);
  }
  return inputs.length > 0 ? inputs : null;
}

function failureForApiError(error: unknown): WidgetLogFailure {
  if (!(error instanceof ApiTransportError)) return "unavailable";
  if (error.code === "session_expired" || error.code === "account_deleted") return "signed_out";
  if (error.serverCode === "entry_consent_required") return "consent_required";
  if (error.code === "plan_limit") return "limit_reached";
  if (error.code === "invalid_request") return "unreadable";
  return "unavailable";
}

export async function logWidgetVoiceNote(
  transcript: string,
  deps: WidgetLogDeps,
): Promise<WidgetLogResult> {
  const note = transcript.trim();
  if (!note) return { status: "failed", reason: "unreadable" };

  const session = await deps.getSession();
  if (!session) return { status: "failed", reason: "signed_out" };

  let workspace: WidgetLogWorkspace;
  let formData: Awaited<ReturnType<WidgetLogWorkspace["readFormData"]>>;
  try {
    workspace = await deps.openWorkspace(session.subject);
    formData = await workspace.readFormData();
  } catch {
    return { status: "failed", reason: "workspace_unavailable" };
  }

  let drafts: TransactionVoiceDraft[];
  try {
    drafts = await deps.extract(
      session.accessToken,
      note,
      formData.categories.filter((category) => !category.pending).map((category) => category.name),
    );
  } catch (error) {
    return { status: "failed", reason: failureForApiError(error) };
  }

  const inputs = buildWidgetTransactionInputs({
    drafts,
    transcript: note,
    accounts: formData.accounts,
    categories: formData.categories,
    defaultAccountId: await deps.defaultAccountId(),
  });
  if (!inputs) return { status: "failed", reason: "no_account" };

  try {
    await workspace.createTransactions(inputs);
  } catch {
    return { status: "failed", reason: "workspace_unavailable" };
  }
  return { status: "logged", count: inputs.length };
}

const FAILURE_MESSAGE: Record<WidgetLogFailure, string> = {
  signed_out: "Sign in to Zoption, then try the widget again.",
  workspace_unavailable: "Open Zoption once so it can unlock your data, then try again.",
  no_account: "Add a PHP account in Zoption so voice entries have somewhere to go.",
  consent_required: "Open Zoption and accept the AI entry notice to log by voice.",
  limit_reached: "You have used this month's AI allowance.",
  unreadable: "Couldn't find an amount. Say each amount and what it was for.",
  unavailable: "Couldn't reach Zoption AI. Nothing was saved. Try again shortly.",
};

/** Notification copy. Never names amounts or descriptions: it can show on a lock screen. */
export function widgetLogNotificationBody(result: WidgetLogResult): string {
  if (result.status === "failed") return FAILURE_MESSAGE[result.reason];
  return result.count === 1
    ? "Logged 1 transaction. It syncs the next time Zoption opens."
    : `Logged ${result.count} transactions. They sync the next time Zoption opens.`;
}
