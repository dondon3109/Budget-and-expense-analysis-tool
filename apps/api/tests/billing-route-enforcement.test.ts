import type {
  AccountRecord,
  CashflowTrend,
  CategoryRecord,
  TransactionListItem,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { AssistantService } from "../src/assistant/service";
import type { AssistantVoiceService } from "../src/assistant/voice-service";
import type { AuthVerifier } from "../src/auth";
import type { AccountRepository } from "../src/db/accounts";
import type { BillingRepository } from "../src/db/billing";
import type { CategoryRepository } from "../src/db/categories";
import type { TenantResolver } from "../src/db/tenants";
import type { TransactionRepository } from "../src/db/transactions";
import type { AiEntryService } from "../src/entry/ai-entry-service";
import { HttpError } from "../src/errors";
import type { RateLimiter } from "../src/rate-limit";
import type { ReceiptService } from "../src/receipts/service";

const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const JSON_HEADERS = { ...AUTHORIZATION, "Content-Type": "application/json" };
const TENANT_ID = "user:user-1";

const account: AccountRecord = {
  id: "account-1",
  name: "Everyday",
  type: "checking",
  currency: "PHP",
  balanceMinor: 0,
  archived: false,
  system: false,
};

const category: CategoryRecord = {
  id: "category-1",
  name: "Health",
  kind: "expense",
  color: "#4f7faf",
  archived: false,
  system: false,
  origin: "custom",
  requiredPlan: "free",
  locked: false,
};

const exportedTransaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-18",
  description: "Groceries",
  amountMinor: -2_455,
  currency: "PHP",
  kind: "expense",
  categoryId: category.id,
  categoryName: category.name,
  categoryColor: category.color,
  accountId: account.id,
  accountName: account.name,
  notes: null,
};

const cashflow: CashflowTrend = {
  view: "weekly",
  granularity: "day",
  range: { from: "2026-07-21", to: "2026-07-27" },
  points: [],
};

function authVerifier(): AuthVerifier {
  return {
    verify: vi.fn(async () => ({
      id: "user-1",
      email: "person@example.com",
      role: "authenticated",
    })),
  };
}

function tenantResolver(): TenantResolver {
  return {
    resolve: vi.fn(async () => ({
      tenantId: TENANT_ID,
      defaultAccountId: `${TENANT_ID}:account:default`,
    })),
  };
}

function rateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}

function billing(requirePro: ReturnType<typeof vi.fn>): BillingRepository {
  return { requirePro } as unknown as BillingRepository;
}

function accounts(): AccountRepository {
  return {
    list: vi.fn(async () => [account]),
    create: vi.fn(async () => account),
    update: vi.fn(async () => account),
    remove: vi.fn(async () => undefined),
  };
}

function categories(): CategoryRepository {
  return {
    list: vi.fn(async () => [category]),
    create: vi.fn(async () => category),
    update: vi.fn(async () => category),
  };
}

function transactions(): TransactionRepository {
  return {
    list: vi.fn(),
    calendar: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    export: vi.fn(async () => [exportedTransaction]),
  };
}

function testApp(options: Parameters<typeof createApp>[0]) {
  return createApp({
    readinessCheck: vi.fn(async () => undefined),
    authVerifier: authVerifier(),
    tenantResolver: tenantResolver(),
    rateLimiter: rateLimiter(),
    ...options,
  });
}

function fileRequest(field: string, file: File) {
  const form = new FormData();
  form.set(field, file);
  return { method: "POST", headers: AUTHORIZATION, body: form };
}

const jsonRequest = (body: unknown) => ({
  method: "POST",
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

/**
 * The six pooled AI paths. Each one consumes the shared monthly pool inside its service, so
 * these fakes only prove the route itself returns a result for a Free tenant with no Pro gate.
 */
const POOLED_AI_ROUTES = [
  {
    name: "assistant thread generation",
    path: "/api/app/assistant/threads",
    init: () =>
      jsonRequest({
        message: "How much did I spend?",
        clientRequestId: "69a6ec67-85bd-4ccb-9354-1410d6dc5fb4",
      }),
    status: 201,
  },
  {
    name: "assistant message generation",
    path: "/api/app/assistant/threads/00000000-0000-4000-8000-000000000001/messages",
    init: () =>
      jsonRequest({
        message: "How much did I spend?",
        clientRequestId: "69a6ec67-85bd-4ccb-9354-1410d6dc5fb4",
      }),
    status: 200,
  },
  {
    name: "assistant voice transcription",
    path: "/api/app/assistant/voice/transcriptions",
    init: () =>
      fileRequest("audio", new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" })),
    status: 200,
  },
  {
    name: "assistant speech synthesis",
    path: "/api/app/assistant/voice/speech",
    init: () => jsonRequest({ messageId: "00000000-0000-4000-8000-000000000002", voice: "bright" }),
    status: 200,
  },
  {
    name: "assistant speech preview",
    path: "/api/app/assistant/voice/preview",
    init: () => jsonRequest({ voice: "energetic" }),
    status: 200,
  },
  {
    name: "receipt extraction",
    path: "/api/app/receipts/extract",
    init: () =>
      fileRequest("image", new File([new Uint8Array([1])], "receipt.jpg", { type: "image/jpeg" })),
    status: 200,
  },
  {
    name: "PDF statement entry",
    path: "/api/app/entry/pdf-preview",
    init: () =>
      fileRequest(
        "pdf",
        new File([new Uint8Array([1])], "statement.pdf", { type: "application/pdf" }),
      ),
    status: 200,
  },
  {
    name: "voice transaction entry",
    path: "/api/app/entry/voice",
    init: () =>
      fileRequest("audio", new File([new Uint8Array([1])], "voice.m4a", { type: "audio/mp4" })),
    status: 200,
  },
] as const;

const POOLED_SERVICES = {
  assistantService: {
    createThreadTurn: vi.fn(async () => ({ ok: true })),
    sendTurn: vi.fn(async () => ({ ok: true })),
  } as unknown as AssistantService,
  assistantVoiceService: {
    transcribe: vi.fn(async () => ({ text: "Check my budget", durationSeconds: 2 })),
    synthesize: vi.fn(async () => new Response(new Uint8Array([1]))),
    preview: vi.fn(async () => new Response(new Uint8Array([1]))),
  } as unknown as AssistantVoiceService,
  receiptService: {
    extract: vi.fn(async () => ({ merchant: "Jollibee", amountMinor: -28_500 })),
  } as unknown as ReceiptService,
  aiEntryService: {
    previewPdf: vi.fn(async () => ({ token: "preview", rows: [] })),
    extractVoice: vi.fn(async () => ({ description: "Lunch" })),
    extractVoiceTranscript: vi.fn(async () => ({ description: "Lunch" })),
  } as unknown as AiEntryService,
};

describe("Pro route enforcement", () => {
  it.each([
    {
      name: "account creation",
      request: {
        path: "/api/app/accounts",
        init: {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: "Savings", type: "savings" }),
        },
      },
      repositoryCall: "account.create" as const,
      capability: "account_management" as const,
    },
    {
      name: "account update",
      request: {
        path: "/api/app/accounts/account-1",
        init: {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: "Daily" }),
        },
      },
      repositoryCall: "account.update" as const,
      capability: "account_management" as const,
    },
    {
      name: "account deletion",
      request: {
        path: "/api/app/accounts/account-1",
        init: { method: "DELETE", headers: AUTHORIZATION },
      },
      repositoryCall: "account.remove" as const,
      capability: "account_management" as const,
    },
    {
      name: "transaction export",
      request: {
        path: "/api/app/exports/transactions.csv",
        init: { headers: AUTHORIZATION },
      },
      repositoryCall: "transaction.export" as const,
      capability: "transaction_export" as const,
    },
  ])("denies $name before its repository", async ({ request, repositoryCall, capability }) => {
    const requirePro = vi.fn(async () => {
      throw new HttpError(403, "pro_plan_required", "Upgrade to Zoption Pro to use this feature.");
    });
    const stores = {
      accounts: accounts(),
      categories: categories(),
      transactions: transactions(),
    };
    const app = testApp({ billing: billing(requirePro), ...stores });

    const response = await app.request(request.path, request.init);

    expect(response.status).toBe(403);
    expect(requirePro).toHaveBeenCalledWith(undefined, TENANT_ID, capability);
    const repositoryMethod =
      repositoryCall === "account.create"
        ? vi.mocked(stores.accounts.create!)
        : repositoryCall === "account.update"
          ? vi.mocked(stores.accounts.update!)
          : repositoryCall === "account.remove"
            ? vi.mocked(stores.accounts.remove!)
            : vi.mocked(stores.transactions.export);
    expect(repositoryMethod).not.toHaveBeenCalled();
  });

  it("lets Free users load the weekly cashflow trend without a Pro check", async () => {
    const requirePro = vi.fn(async () => {
      throw new Error("weekly cashflow must not require Pro");
    });
    const loader = vi.fn(async () => cashflow);
    const app = testApp({ billing: billing(requirePro), cashflowTrendLoader: loader });

    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=weekly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(200);
    expect(requirePro).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledWith(undefined, TENANT_ID, {
      view: "weekly",
      anchorDate: "2026-07-27",
    });
  });

  it.each(["monthly", "sixMonth"] as const)(
    "denies the %s cashflow trend before the loader",
    async (view) => {
      const requirePro = vi.fn(async () => {
        throw new HttpError(
          403,
          "pro_plan_required",
          "Upgrade to Zoption Pro to use this feature.",
        );
      });
      const loader = vi.fn(async () => cashflow);
      const app = testApp({ billing: billing(requirePro), cashflowTrendLoader: loader });

      const response = await app.request(
        `/api/app/dashboard/cashflow-trend?view=${view}&anchorDate=2026-07-27`,
        { headers: AUTHORIZATION },
      );

      expect(response.status).toBe(403);
      expect(requirePro).toHaveBeenCalledWith(undefined, TENANT_ID, "cashflow_analytics");
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it("validates cashflow trend queries before checking the plan", async () => {
    const requirePro = vi.fn(async () => undefined);
    const loader = vi.fn(async () => cashflow);
    const app = testApp({ billing: billing(requirePro), cashflowTrendLoader: loader });

    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=yearly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(400);
    expect(requirePro).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
  });

  it("lets the category repository enforce its allowance while account writes remain Pro-gated", async () => {
    const requirePro = vi.fn(async () => undefined);
    const accountStore = accounts();
    const categoryStore = categories();
    const app = testApp({
      billing: billing(requirePro),
      accounts: accountStore,
      categories: categoryStore,
    });

    const categoryResponse = await app.request("/api/app/categories", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Health", kind: "expense", color: "#4f7faf" }),
    });
    const accountResponse = await app.request("/api/app/accounts", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Savings", type: "savings" }),
    });

    expect(categoryResponse.status).toBe(201);
    expect(categoryStore.create).toHaveBeenCalledWith(undefined, TENANT_ID, {
      name: "Health",
      kind: "expense",
      color: "#4f7faf",
    });
    expect(accountResponse.status).toBe(201);
    expect(requirePro).toHaveBeenCalledOnce();
    expect(requirePro).toHaveBeenCalledWith(undefined, TENANT_ID, "account_management");
    expect(requirePro.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(accountStore.create!).mock.invocationCallOrder[0]!,
    );
  });

  it("checks Pro before export repositories and paid cashflow loaders", async () => {
    const requirePro = vi.fn(async () => undefined);
    const transactionStore = transactions();
    const loader = vi.fn(async () => cashflow);
    const app = testApp({
      billing: billing(requirePro),
      transactions: transactionStore,
      cashflowTrendLoader: loader,
    });

    const exportResponse = await app.request("/api/app/exports/transactions.csv", {
      headers: AUTHORIZATION,
    });
    const cashflowResponse = await app.request(
      "/api/app/dashboard/cashflow-trend?view=monthly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(exportResponse.status).toBe(200);
    expect(cashflowResponse.status).toBe(200);
    expect(requirePro.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(transactionStore.export).mock.invocationCallOrder[0]!,
    );
    expect(requirePro.mock.invocationCallOrder[1]).toBeLessThan(
      loader.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps account and category reads available without a Pro check", async () => {
    const requirePro = vi.fn(async () => {
      throw new Error("reads must not require Pro");
    });
    const accountStore = accounts();
    const categoryStore = categories();
    const app = testApp({
      billing: billing(requirePro),
      accounts: accountStore,
      categories: categoryStore,
    });

    const accountResponse = await app.request("/api/app/accounts", { headers: AUTHORIZATION });
    const categoryResponse = await app.request("/api/app/categories", { headers: AUTHORIZATION });

    expect(accountResponse.status).toBe(200);
    expect(categoryResponse.status).toBe(200);
    expect(accountStore.list).toHaveBeenCalledWith(undefined, TENANT_ID);
    expect(categoryStore.list).toHaveBeenCalledWith(undefined, TENANT_ID, false);
    expect(requirePro).not.toHaveBeenCalled();
  });
});

describe("pooled AI route access", () => {
  it.each(POOLED_AI_ROUTES)(
    "serves $name to a Free tenant without a Pro gate",
    async ({ path, init, status }) => {
      const requirePro = vi.fn(async () => {
        throw new HttpError(403, "upgrade_required", "This feature requires Zoption Pro.");
      });
      const app = testApp({ billing: billing(requirePro), ...POOLED_SERVICES });

      const response = await app.request(path, init(), { ASSISTANT_ENABLED: "true" });

      expect(response.status).toBe(status);
      expect(requirePro).not.toHaveBeenCalled();
    },
  );

  it.each(POOLED_AI_ROUTES)(
    "caps $name by the minute instead of a per-day ceiling",
    async ({ path, init }) => {
      const consume = vi.fn(
        async (_env: unknown, _identity: string, _policy: { windowSeconds: number }) => ({
          allowed: true,
          limit: 60,
          remaining: 59,
          retryAfterSeconds: 60,
        }),
      );
      const app = testApp({
        billing: billing(vi.fn(async () => undefined)),
        rateLimiter: { consume },
        ...POOLED_SERVICES,
      });

      const response = await app.request(path, init(), { ASSISTANT_ENABLED: "true" });

      expect(response.status).not.toBe(429);
      const policies = consume.mock.calls.map((call) => call[2]);
      expect(policies.length).toBeGreaterThan(0);
      expect(policies.every((policy) => policy.windowSeconds === 60)).toBe(true);
    },
  );
});
