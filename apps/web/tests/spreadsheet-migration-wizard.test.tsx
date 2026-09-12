// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { ImportPreview } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { commitImport, createAccount, getAccounts, previewImport } from "../src/lib/api";
import { SpreadsheetMigrationWizard } from "../src/components/onboarding/SpreadsheetMigrationWizard";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
  }),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  getAccounts: vi.fn(),
  createAccount: vi.fn(),
  previewImport: vi.fn(),
  commitImport: vi.fn(),
}));

const mockPreview: ImportPreview = {
  token: "550e8400-e29b-41d4-a716-446655440000",
  expiresAt: "2026-07-21T00:00:00.000Z",
  fileName: "bank-statement.csv",
  rowCount: 2,
  acceptedCount: 1,
  duplicateCount: 1,
  rejectedCount: 0,
  rows: [
    {
      rowNumber: 2,
      date: "2026-07-20",
      description: "Supermarket groceries",
      amountMinor: -150_000,
      kind: "expense",
      categoryName: "Food & dining",
      categoryIsUncategorized: false,
      status: "ready",
      errors: [],
    },
    {
      rowNumber: 3,
      date: "2026-07-21",
      description: "Salary deposit",
      amountMinor: 2_500_000,
      kind: "income",
      categoryName: "Salary",
      categoryIsUncategorized: false,
      status: "duplicate",
      errors: [],
    },
  ],
};

function renderWizard(
  props: { open?: boolean; onClose?: () => void; onComplete?: () => void } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SpreadsheetMigrationWizard
        open={props.open ?? true}
        onClose={props.onClose ?? vi.fn()}
        onComplete={props.onComplete}
      />
    </QueryClientProvider>,
  );
}

function createFile(name: string, content: string, type = "text/csv"): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

describe("SpreadsheetMigrationWizard", () => {
  const apiMocks = {
    getAccounts: vi.mocked(getAccounts),
    createAccount: vi.mocked(createAccount),
    previewImport: vi.mocked(previewImport),
    commitImport: vi.mocked(commitImport),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getAccounts.mockResolvedValue([
      {
        id: "account-1",
        name: "Everyday Checking",
        type: "checking",
        currency: "PHP",
        balanceMinor: 10_000,
        archived: false,
        system: false,
      },
    ]);
    apiMocks.previewImport.mockResolvedValue(mockPreview);
    apiMocks.commitImport.mockResolvedValue({
      importedCount: 1,
      rejectedCount: 0,
    } as any);
  });

  afterEach(cleanup);

  it("renders step 1 with drag & drop and account options when open", async () => {
    renderWizard();

    expect(
      screen.getByRole("heading", { name: "Spreadsheet Migration Wizard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1. Choose file")).toBeInTheDocument();
    expect(screen.getByText("Choose a CSV or Excel bank statement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download sample csv/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Everyday Checking (PHP)")).toBeInTheDocument();
    });
  });

  it("walks through file selection, column mapping, duplicate preview, and commit", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onClose = vi.fn();
    const { container } = renderWizard({ onComplete, onClose });

    const csvContent = [
      "Date,Description,Amount,Category",
      '2026-07-20,"Supermarket groceries",-1500.00,"Food & dining"',
      "2026-07-21,Salary deposit,25000.00,Salary",
    ].join("\n");

    const file = createFile("bank-statement.csv", csvContent);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    await user.upload(fileInput, file);

    // Shows selected file name
    await waitFor(() => {
      expect(screen.getByText("bank-statement.csv")).toBeInTheDocument();
      expect(screen.getByText("4 columns detected")).toBeInTheDocument();
    });

    // Continue to step 2: column mapping
    const continueBtn = screen.getByRole("button", { name: /continue to column mapping/i });
    await user.click(continueBtn);

    // In Step 2
    expect(screen.getByText("2. Map columns")).toBeInTheDocument();
    expect(screen.getByLabelText("Date column *")).toHaveValue("Date");
    expect(screen.getByLabelText("Description / Payee *")).toHaveValue("Description");
    expect(screen.getByLabelText("Amount column *")).toHaveValue("Amount");
    expect(screen.getByText("Sample rows preview (2 shown)")).toBeInTheDocument();

    // Review & check duplicates
    const reviewBtn = screen.getByRole("button", { name: /review & check duplicates/i });
    await user.click(reviewBtn);

    // In Step 3
    await waitFor(() => {
      expect(screen.getByText("3. Review & dedupe")).toBeInTheDocument();
      expect(screen.getByText("Ready to import")).toBeInTheDocument();
      expect(screen.getByText("Duplicates skipped")).toBeInTheDocument();
      expect(screen.getByText("Duplicate (Skip)")).toBeInTheDocument();
    });

    // Commit import
    const commitBtn = screen.getByRole("button", { name: /import 1 transactions/i });
    await user.click(commitBtn);

    // In Step 4: Migration Complete
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Migration Complete!" })).toBeInTheDocument();
    });

    const finishBtn = screen.getByRole("button", { name: /view my populated dashboard/i });
    await user.click(finishBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });
});
