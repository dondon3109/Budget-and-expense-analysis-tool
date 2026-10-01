import type { TransactionInput, TransactionVoiceDraft } from "@zoption/shared";

import { ApiTransportError } from "@/api/authenticated";
import type { LocalAccountOption, LocalCategoryOption } from "@/db/view-models";

import {
  buildWidgetTransactionInputs,
  logWidgetVoiceNote,
  widgetLogNotificationBody,
  type WidgetLogDeps,
  type WidgetLogWorkspace,
} from "./widget-voice-log";

const CASH = "11111111-1111-4111-8111-111111111111";
const GCASH = "22222222-2222-4222-8222-222222222222";
const DINING = "33333333-3333-4333-8333-333333333333";
const GROCERIES = "44444444-4444-4444-8444-444444444444";
const SALARY = "55555555-5555-4555-8555-555555555555";

function account(id: string, name: string, type: LocalAccountOption["type"] = "cash") {
  return { id, name, type, currency: "PHP", pending: false } as LocalAccountOption;
}

function category(id: string, name: string, kind: LocalCategoryOption["kind"] = "expense") {
  return { id, name, kind, color: "#000", iconEmoji: null, pending: false } as LocalCategoryOption;
}

const accounts = [account(CASH, "Cash"), account(GCASH, "GCash", "other")];
const categories = [
  category(DINING, "Dining & Food"),
  category(GROCERIES, "Groceries"),
  category(SALARY, "Salary", "income"),
];

function draft(overrides: Partial<TransactionVoiceDraft>): TransactionVoiceDraft {
  return {
    transcript: "I spent 250 on Jollibee for lunch and 2,000 on groceries",
    description: "Jollibee lunch",
    date: "2026-10-01",
    amountMinor: 25_000,
    currency: "PHP",
    kind: "expense",
    ...overrides,
  };
}

const drafts = [
  draft({ categoryName: "Dining & Food" }),
  draft({ description: "Groceries", amountMinor: 200_000, categoryName: "Groceries" }),
];

describe("buildWidgetTransactionInputs", () => {
  it("builds one input per spoken entry on the default account", () => {
    const inputs = buildWidgetTransactionInputs({
      drafts,
      transcript: drafts[0]!.transcript,
      accounts,
      categories,
      defaultAccountId: GCASH,
    });
    expect(inputs).toEqual([
      expect.objectContaining({
        accountId: GCASH,
        categoryId: DINING,
        amountMinor: 25_000,
        description: "Jollibee lunch",
        kind: "expense",
        currency: "PHP",
      }),
      expect.objectContaining({
        accountId: GCASH,
        categoryId: GROCERIES,
        amountMinor: 200_000,
      }),
    ]);
  });

  it("uses an account the speaker named, and falls back to Uncategorized-style matching", () => {
    const inputs = buildWidgetTransactionInputs({
      drafts: [draft({ categoryName: "Nonsense" })],
      transcript: "spent 250 on lunch using cash",
      accounts,
      categories,
      defaultAccountId: GCASH,
    });
    expect(inputs?.[0]).toMatchObject({ accountId: CASH });
    expect(inputs?.[0]?.categoryId).toBeTruthy();
  });

  it("refuses when no PHP account exists, since the amounts are pesos", () => {
    expect(
      buildWidgetTransactionInputs({
        drafts,
        transcript: "x",
        accounts: [{ ...account(CASH, "Cash"), currency: "USD" } as LocalAccountOption],
        categories,
        defaultAccountId: null,
      }),
    ).toBeNull();
  });

  it("refuses when an entry has no category of its kind", () => {
    expect(
      buildWidgetTransactionInputs({
        drafts: [draft({ kind: "income" })],
        transcript: "x",
        accounts,
        categories: [category(DINING, "Dining & Food")],
        defaultAccountId: null,
      }),
    ).toBeNull();
  });
});

function makeDeps(overrides: Partial<WidgetLogDeps> = {}) {
  const createTransactions = jest.fn(async (_inputs: TransactionInput[]) => ["id"]);
  const workspace: WidgetLogWorkspace = {
    readFormData: async () => ({ accounts, categories }),
    createTransactions,
  };
  const deps: WidgetLogDeps = {
    getSession: async () => ({ accessToken: "token", subject: "user-1" }),
    openWorkspace: async () => workspace,
    defaultAccountId: async () => null,
    extract: jest.fn(async () => drafts),
    ...overrides,
  };
  return { deps, createTransactions };
}

describe("logWidgetVoiceNote", () => {
  const note = "I spent 250 on Jollibee for lunch and 2,000 on groceries";

  it("saves every entry in one batch and reports the count", async () => {
    const { deps, createTransactions } = makeDeps();
    await expect(logWidgetVoiceNote(note, deps)).resolves.toEqual({ status: "logged", count: 2 });
    expect(createTransactions).toHaveBeenCalledTimes(1);
    expect(createTransactions.mock.calls[0]?.[0]).toHaveLength(2);
    expect(deps.extract).toHaveBeenCalledWith("token", note, [
      "Dining & Food",
      "Groceries",
      "Salary",
    ]);
  });

  it("saves nothing when signed out, and never calls the AI", async () => {
    const { deps, createTransactions } = makeDeps({ getSession: async () => null });
    await expect(logWidgetVoiceNote(note, deps)).resolves.toEqual({
      status: "failed",
      reason: "signed_out",
    });
    expect(deps.extract).not.toHaveBeenCalled();
    expect(createTransactions).not.toHaveBeenCalled();
  });

  it("reports an unreadable local workspace without calling the AI", async () => {
    const { deps } = makeDeps({
      openWorkspace: async () => {
        throw new Error("locked");
      },
    });
    await expect(logWidgetVoiceNote(note, deps)).resolves.toEqual({
      status: "failed",
      reason: "workspace_unavailable",
    });
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiTransportError("x", "conflict", 409, "entry_consent_required"), "consent_required"],
    [new ApiTransportError("x", "plan_limit", 409, "monthly_limit_reached"), "limit_reached"],
    [new ApiTransportError("x", "session_expired", 401), "signed_out"],
    [
      new ApiTransportError("x", "invalid_request", 422, "voice_transaction_unreadable"),
      "unreadable",
    ],
    [new ApiTransportError("x", "network", 0), "unavailable"],
  ] as const)("maps an AI failure to a reason and saves nothing", async (error, reason) => {
    const { deps, createTransactions } = makeDeps({
      extract: async () => {
        throw error;
      },
    });
    await expect(logWidgetVoiceNote(note, deps)).resolves.toEqual({ status: "failed", reason });
    expect(createTransactions).not.toHaveBeenCalled();
  });

  it("does not claim success when the local write fails", async () => {
    const { deps, createTransactions } = makeDeps();
    createTransactions.mockRejectedValueOnce(new Error("disk"));
    await expect(logWidgetVoiceNote(note, deps)).resolves.toEqual({
      status: "failed",
      reason: "workspace_unavailable",
    });
  });
});

describe("widgetLogNotificationBody", () => {
  it("never names amounts or descriptions", () => {
    expect(widgetLogNotificationBody({ status: "logged", count: 1 })).toMatch(
      /^Logged 1 transaction\./,
    );
    expect(widgetLogNotificationBody({ status: "logged", count: 3 })).toMatch(
      /^Logged 3 transactions\./,
    );
    expect(widgetLogNotificationBody({ status: "failed", reason: "unavailable" })).toMatch(
      /Nothing was saved/,
    );
  });
});
