/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";

import type { AccountRecord, BillingSummary, CategoryRecord, ImportPreview, SubscriptionMonthSummary, SubscriptionRecord } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportDraftProvider } from "../src/import/ImportDraftProvider";
import {
  createSubscription,
  getAccounts,
  getBillingSummary,
  getCategories,
  getSubscriptions,
  previewImport,
} from "../src/lib/api";
import { ImportPage } from "../src/pages/ImportPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  createSubscription: vi.fn(),
  getAccounts: vi.fn(),
  getBillingSummary: vi.fn(),
  getCategories: vi.fn(),
  getSubscriptions: vi.fn(),
  previewImport: vi.fn(),
  commitImport: vi.fn().mockResolvedValue({ importId: "import-1", importedCount: 1, rejectedCount: 0 }),
}));

const categories: CategoryRecord[] = [
  {
    id: "food",
    name: "Food & dining",
    kind: "expense",
    color: "#dc8b3f",
    archived: false,
    system: false,
    origin: "custom",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "entertainment",
    name: "Entertainment",
    kind: "expense",
    color: "#7363a6",
    archived: false,
    system: false,
    origin: "custom",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    archived: false,
    system: true,
    origin: "system",
    requiredPlan: "free",
    locked: false,
  },
];

const accounts: AccountRecord[] = [
  { id: "acc-1", name: "Everyday", type: "checking", currency: "PHP", balanceMinor: null, balanceAsOf: null, archived: false },
];

const billingSummary: BillingSummary = {
  plan: "free",
  entitlementSource: null,
  provider: null,
  status: null,
  interval: null,
  currentPeriodEndsAt: null,
  scheduledChangeAt: null,
  cancelAtPeriodEnd: false,
  pendingCheckout: null,
  canCheckout: true,
  canManageBilling: false,
  canManageSponsoredSeats: false,
  nonTerminalSubscriptionCount: 0,
  usages: [
    { feature: "assistant_question", used: 0, limit: 4, periodKind: "anchored_14_day", periodStartedAt: "2026-07-18T00:00:00.000Z", resetsAt: "2026-08-01T00:00:00.000Z" },
    { feature: "file_import", used: 0, limit: 1, periodKind: "calendar_month", periodStartedAt: "2026-07-01T00:00:00.000Z", resetsAt: "2026-08-01T00:00:00.000Z" },
  ],
  allowances: [{ resource: "custom_category", used: 0, limit: 1 }],
};

const recurringPreview: ImportPreview = {
  token: "preview-token",
  expiresAt: "2026-08-15T12:00:00.000Z",
  fileName: "bank.csv",
  rowCount: 3,
  acceptedCount: 3,
  rejectedCount: 0,
  duplicateCount: 0,
  rows: [
    { rowNumber: 2, status: "ready", date: "2026-05-15", description: "Netflix", amountMinor: -54900, kind: "expense", categoryId: "entertainment", categoryName: "Entertainment", errors: [] },
    { rowNumber: 3, status: "ready", date: "2026-06-15", description: "Netflix", amountMinor: -54900, kind: "expense", categoryId: "entertainment", categoryName: "Entertainment", errors: [] },
    { rowNumber: 4, status: "ready", date: "2026-07-15", description: "Netflix", amountMinor: -54900, kind: "expense", categoryId: "entertainment", categoryName: "Entertainment", errors: [] },
  ],
};

const nonRecurringPreview: ImportPreview = {
  token: "tok2",
  expiresAt: "2026-08-15T12:00:00.000Z",
  fileName: "one.csv",
  rowCount: 1,
  acceptedCount: 1,
  rejectedCount: 0,
  duplicateCount: 0,
  rows: [
    { rowNumber: 2, status: "ready", date: "2026-07-20", description: "Groceries", amountMinor: -120000, kind: "expense", categoryId: "food", categoryName: "Food & dining", errors: [] },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ImportDraftProvider>
          <MemoryRouter>
            <ImportPage />
          </MemoryRouter>
        </ImportDraftProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function fileWithBuffer(name: string, content: string, type: string): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new TextEncoder().encode(content).buffer),
  });
  return file;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input not rendered");
  return input;
}

afterEach(cleanup);

describe("Import auto-detection of recurring charges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue(billingSummary);
    vi.mocked(getCategories).mockResolvedValue(categories);
    vi.mocked(getAccounts).mockResolvedValue(accounts);
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-08-01",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [],
    });
    vi.mocked(createSubscription).mockResolvedValue({
      id: "sub-1",
      name: "Netflix",
      amountMinor: 54900,
      currency: "PHP",
      billingCycle: "monthly",
      nextBillingDate: "2026-08-15",
      status: "active",
      categoryId: "entertainment",
      categoryName: "Entertainment",
      categoryColor: "#7363a6",
      accountId: "acc-1",
      accountName: "Everyday",
    } satisfies SubscriptionRecord);
  });

  it("shows suggestion banner when recurring charges are detected in CSV", async () => {
    vi.mocked(previewImport).mockResolvedValue(recurringPreview);
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-05-15,Netflix,-549.00,Entertainment", "2026-06-15,Netflix,-549.00,Entertainment", "2026-07-15,Netflix,-549.00,Entertainment"].join("\n");
    await user.upload(fileInput(container), fileWithBuffer("bank.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());

    expect(await screen.findByText(/recurring charge/i)).toBeInTheDocument();
    expect(screen.getByText("Netflix", { selector: ".suggestion-merchant" })).toBeInTheDocument();
    expect(screen.getByText(/Monthly billing/i)).toBeInTheDocument();
    expect(screen.getByText(/3 times in 3 months/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Track as subscription/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Renewal Calendar/).length).toBeGreaterThan(0);
  });

  it("does not show banner for non-recurring single row", async () => {
    vi.mocked(previewImport).mockResolvedValue(nonRecurringPreview);
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-07-20,Groceries,-1200.00,Food & dining"].join("\n");
    await user.upload(fileInput(container), fileWithBuffer("one.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());

    await waitFor(() => expect(screen.getAllByText(/Ready/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/recurring charge/i)).not.toBeInTheDocument();
  });

  it("hides suggestion when merchant already tracked as subscription", async () => {
    vi.mocked(previewImport).mockResolvedValue(recurringPreview);
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-08-01",
      currency: "PHP",
      totalMonthlyCostMinor: 54900,
      items: [
        {
          id: "existing",
          name: "Netflix",
          amountMinor: 54900,
          currency: "PHP",
          billingCycle: "monthly",
          nextBillingDate: "2026-08-15",
          status: "active",
          categoryId: "entertainment",
          categoryName: "Entertainment",
          categoryColor: "#7363a6",
          accountId: "acc-1",
          accountName: "Everyday",
          billingDate: "2026-08-15",
          monthlyCostMinor: 54900,
        },
      ],
    } satisfies SubscriptionMonthSummary);
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-05-15,Netflix,-549.00,Entertainment", "2026-06-15,Netflix,-549.00,Entertainment", "2026-07-15,Netflix,-549.00,Entertainment"].join("\n");
    await user.upload(fileInput(container), fileWithBuffer("bank.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    await waitFor(() => expect(getSubscriptions).toHaveBeenCalled());

    expect((await screen.findAllByText(/Ready/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText(/recurring charge/i)).not.toBeInTheDocument());
  });

  it("opens prefilled subscription form and creates subscription", async () => {
    vi.mocked(previewImport).mockResolvedValue(recurringPreview);
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-05-15,Netflix,-549.00,Entertainment", "2026-06-15,Netflix,-549.00,Entertainment", "2026-07-15,Netflix,-549.00,Entertainment"].join("\n");
    await user.upload(fileInput(container), fileWithBuffer("bank.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    const trackButton = await screen.findByRole("button", { name: /Track as subscription/i });
    await waitFor(() => expect(trackButton).toBeEnabled());

    await user.click(trackButton);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("Netflix")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("549");

    await user.click(screen.getByRole("button", { name: "Add subscription" }));
    await waitFor(() =>
      expect(createSubscription).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ name: "Netflix", amountMinor: 54900, billingCycle: "monthly" }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/is now tracked as an active subscription/)).toBeInTheDocument());
  });

  it("dismisses suggestion via Not now and Dismiss all", async () => {
    vi.mocked(previewImport).mockResolvedValue(recurringPreview);
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-05-15,Netflix,-549.00,Entertainment", "2026-06-15,Netflix,-549.00,Entertainment", "2026-07-15,Netflix,-549.00,Entertainment"].join("\n");
    await user.upload(fileInput(container), fileWithBuffer("bank.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await screen.findByRole("button", { name: /Track as subscription/i });

    await user.click(screen.getByRole("button", { name: "Dismiss Netflix" }));
    expect(screen.queryByText("Netflix", { selector: ".suggestion-merchant" })).not.toBeInTheDocument();
    expect(screen.queryByText(/recurring charge/i)).not.toBeInTheDocument();
  });
});
