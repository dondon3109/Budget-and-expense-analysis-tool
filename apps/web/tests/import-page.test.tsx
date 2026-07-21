// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { ImportPreview } from "@budget/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { previewImport } from "../src/lib/api";
import { ImportPage } from "../src/pages/ImportPage";

const workbook = vi.hoisted(() => ({
  inspect: vi.fn(),
  convert: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  commitImport: vi.fn(),
  previewImport: vi.fn(),
}));

vi.mock("../src/lib/workbookImportClient", () => ({
  WorkbookImportClient: class {
    inspect = workbook.inspect;
    convert = workbook.convert;
    dispose = workbook.dispose;
  },
}));

const preview: ImportPreview = {
  token: "preview-token",
  expiresAt: "2026-07-21T12:15:00.000Z",
  fileName: "transactions.csv",
  rowCount: 1,
  acceptedCount: 1,
  rejectedCount: 0,
  duplicateCount: 0,
  rows: [
    {
      rowNumber: 2,
      status: "ready",
      date: "2026-07-20",
      description: "Market",
      amountMinor: -5000,
      kind: "expense",
      categoryName: "Food & dining",
      errors: [],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ImportPage />
      </QueryClientProvider>
    </MemoryRouter>,
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
  if (!input) throw new Error("File input was not rendered.");
  return input;
}

afterEach(cleanup);

describe("ImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(previewImport).mockResolvedValue(preview);
  });

  it("keeps CSV imports on the existing mapping and preview path", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-07-20,Market,-50.00,Food & dining"].join(
      "\n",
    );

    await user.upload(fileInput(container), fileWithBuffer("transactions.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(workbook.inspect).not.toHaveBeenCalled();
    expect(previewImport).toHaveBeenCalledWith(
      { key: "user:test-user", userId: "test-user" },
      {
        fileName: "transactions.csv",
        csvText: csv,
        mapping: {
          date: "Date",
          description: "Description",
          amount: "Amount",
          category: "Category",
          kind: undefined,
          currency: undefined,
        },
      },
    );
  });

  it("requires a worksheet choice and previews only the selected worksheet", async () => {
    const user = userEvent.setup();
    workbook.inspect.mockResolvedValue(["Instructions", "Transactions"]);
    workbook.convert.mockResolvedValue({
      csvText: "Date,Description,Amount,Category\n2026-07-20,Market,-50.00,Food & dining",
      headers: ["Date", "Description", "Amount", "Category"],
      rowCount: 1,
      warnings: [
        "Formula cells use their last saved results and are not recalculated during import.",
      ],
    });
    const { container } = renderPage();
    const excel = fileWithBuffer(
      "bank-export.xlsx",
      "workbook bytes",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    await user.upload(fileInput(container), excel);
    const worksheet = await screen.findByLabelText("Worksheet");
    expect(workbook.convert).not.toHaveBeenCalled();

    await user.selectOptions(worksheet, "Transactions");
    expect(await screen.findByText(/Worksheet: Transactions · 1 data row/)).toBeInTheDocument();
    expect(screen.getByText(/Formula cells use their last saved results/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(workbook.convert).toHaveBeenCalledWith("Transactions");
    const request = vi.mocked(previewImport).mock.calls[0]?.[1];
    expect(request?.fileName).toBe("bank-export.xlsx");
    expect(request?.csvText).toContain("2026-07-20,Market");
  });

  it("automatically converts a single-sheet workbook and disposes it on unmount", async () => {
    const user = userEvent.setup();
    workbook.inspect.mockResolvedValue(["Transactions"]);
    workbook.convert.mockResolvedValue({
      csvText: "Date,Description,Amount,Category\n2026-07-20,Market,-50.00,Food & dining",
      headers: ["Date", "Description", "Amount", "Category"],
      rowCount: 1,
      warnings: [],
    });
    const { container, unmount } = renderPage();

    await user.upload(
      fileInput(container),
      fileWithBuffer("bank.xls", "workbook bytes", "application/vnd.ms-excel"),
    );

    expect(await screen.findByText(/Worksheet: Transactions · 1 data row/)).toBeInTheDocument();
    expect(workbook.convert).toHaveBeenCalledWith("Transactions");
    unmount();
    expect(workbook.dispose).toHaveBeenCalledOnce();
  });
});
